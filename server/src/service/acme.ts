/**
 * ACME Certificate Service
 * 
 * Handles SSL certificate issuance via Let's Encrypt using DNS-01 challenge.
 * Leverages existing DNS adapters for automated DNS record management.
 */

import * as acme from 'acme-client';
import { createAdapter } from '../lib/dns/DnsHelper';
import { log } from '../lib/logger';

/** ACME directory URLs */
const ACME_DIRECTORY_PRODUCTION = acme.directory.letsencrypt.production;
const ACME_DIRECTORY_STAGING = acme.directory.letsencrypt.staging;

export interface AcmeIssuanceResult {
  certificate: string;
  caCertificate: string;
  privateKey: string;
  csr: string;
  notBefore: string;
  notAfter: string;
  issuer: string;
  acmeAccountUrl: string;
  acmeAccountKey: string;
}

interface DnsAdapterInfo {
  type: string;
  config: Record<string, string>;
  domain: string;
  zoneId: string;
}

/**
 * Issue an SSL certificate using ACME DNS-01 challenge.
 * 
 * @param domainName - The domain name for the certificate (e.g. "example.com" or "*.example.com")
 * @param adapterInfo - DNS adapter configuration for adding challenge records
 * @param useStaging - Whether to use Let's Encrypt staging (for testing)
 * @param existingAccountKey - Existing ACME account key PEM (for renewal)
 * @param existingAccountUrl - Existing ACME account URL (for renewal)
 */
export async function issueCertificate(
  domainName: string,
  adapterInfo: DnsAdapterInfo,
  useStaging = false,
  existingAccountKey?: string,
  existingAccountUrl?: string
): Promise<AcmeIssuanceResult> {
  const directoryUrl = useStaging ? ACME_DIRECTORY_STAGING : ACME_DIRECTORY_PRODUCTION;

  log.info('ACME', `Starting certificate issuance for ${domainName}`, { staging: useStaging });

  // Create or reuse ACME account key
  let accountKey: Buffer;
  if (existingAccountKey) {
    accountKey = Buffer.from(existingAccountKey, 'utf-8');
  } else {
    accountKey = await acme.crypto.createPrivateKey();
  }

  // Create ACME client
  const client = new acme.Client({
    directoryUrl,
    accountKey,
    accountUrl: existingAccountUrl || undefined,
  });

  // Create DNS adapter for challenge management
  const adapter = createAdapter(
    adapterInfo.type,
    adapterInfo.config,
    adapterInfo.domain,
    adapterInfo.zoneId
  );

  // Generate certificate private key and CSR
  const [certKey, csr] = await acme.crypto.createCsr({
    commonName: domainName,
  });

  let addedRecordIds: string[] = [];

  try {
    // Request certificate using auto mode with DNS-01 challenge
    const certificate = await client.auto({
      csr,
      termsOfServiceAgreed: true,
      challengeCreateFn: async (_authz, challenge, keyAuthorization) => {
        if (challenge.type !== 'dns-01') {
          throw new Error(`Unsupported challenge type: ${challenge.type}`);
        }

        // Determine the subdomain for the challenge record
        const challengeDomain = domainName.startsWith('*.')
          ? domainName.slice(2)
          : domainName;
        
        // Build the _acme-challenge record name  
        // If domain is "example.com", record name is "_acme-challenge"
        // If domain is "sub.example.com" (and zone is "example.com"), record name is "_acme-challenge.sub"
        const baseDomain = adapterInfo.domain;
        let recordName: string;
        if (challengeDomain === baseDomain) {
          recordName = '_acme-challenge';
        } else {
          const subdomain = challengeDomain.replace(`.${baseDomain}`, '');
          recordName = `_acme-challenge.${subdomain}`;
        }

        log.info('ACME', `Adding DNS-01 challenge record: ${recordName}.${baseDomain} TXT ${keyAuthorization}`);

        const recordId = await adapter.addDomainRecord(
          recordName,
          'TXT',
          keyAuthorization,
          undefined, // line
          60, // TTL - short for faster propagation
        );

        if (!recordId) {
          throw new Error('Failed to add DNS challenge record');
        }

        addedRecordIds.push(recordId);

        // Wait for DNS propagation
        log.info('ACME', 'Waiting for DNS propagation (30s)...');
        await sleep(30000);
      },
      challengeRemoveFn: async (_authz, _challenge, _keyAuthorization) => {
        // Cleanup challenge records
        for (const recordId of addedRecordIds) {
          try {
            await adapter.deleteDomainRecord(recordId);
            log.info('ACME', `Removed DNS challenge record: ${recordId}`);
          } catch (err) {
            log.warn('ACME', `Failed to remove DNS challenge record: ${recordId}`, { error: err });
          }
        }
        addedRecordIds = [];
      },
    });

    // Parse certificate dates
    const certInfo = parseCertificateInfo(certificate);

    const accountUrl = client.getAccountUrl();

    log.info('ACME', `Certificate issued successfully for ${domainName}`, {
      notBefore: certInfo.notBefore,
      notAfter: certInfo.notAfter,
    });

    return {
      certificate: splitCertificates(certificate).cert,
      caCertificate: splitCertificates(certificate).ca,
      privateKey: certKey.toString(),
      csr: csr.toString(),
      notBefore: certInfo.notBefore,
      notAfter: certInfo.notAfter,
      issuer: certInfo.issuer,
      acmeAccountUrl: accountUrl,
      acmeAccountKey: accountKey.toString(),
    };
  } catch (error) {
    // Ensure challenge records are cleaned up on error
    for (const recordId of addedRecordIds) {
      try {
        await adapter.deleteDomainRecord(recordId);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

/**
 * Split a full certificate chain into cert + CA cert
 */
function splitCertificates(fullChain: string): { cert: string; ca: string } {
  const certs = fullChain.split(/(?=-----BEGIN CERTIFICATE-----)/);
  return {
    cert: (certs[0] || '').trim(),
    ca: certs.slice(1).join('').trim(),
  };
}

/**
 * Parse basic certificate information from PEM using X.509 parsing
 */
function parseCertificateInfo(certPem: string): { notBefore: string; notAfter: string; issuer: string } {
  try {
    // Use Node.js crypto to parse X.509 certificate
    const crypto = require('crypto');
    const x509 = new crypto.X509Certificate(certPem);
    
    return {
      notBefore: new Date(x509.validFrom).toISOString(),
      notAfter: new Date(x509.validTo).toISOString(),
      issuer: x509.issuer || "Let's Encrypt",
    };
  } catch {
    // Fallback: estimate dates (Let's Encrypt certs are valid for 90 days)
    const now = new Date();
    const notAfter = new Date(now);
    notAfter.setDate(notAfter.getDate() + 90);

    return {
      notBefore: now.toISOString(),
      notAfter: notAfter.toISOString(),
      issuer: "Let's Encrypt",
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
