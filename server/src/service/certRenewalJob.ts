/**
 * SSL Certificate Renewal Job
 * 
 * Periodically checks for certificates that are approaching expiration
 * and automatically renews them using the ACME service.
 */

import { CertificateOperations, DnsAccountOperations, DomainOperations } from '../db/business-adapter';
import { issueCertificate } from './acme';
import { log } from '../lib/logger';

const RENEWAL_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // Check every 6 hours
const DAYS_BEFORE_EXPIRY = 30; // Renew 30 days before expiration

let renewalTimeout: ReturnType<typeof setTimeout> | null = null;
let renewalInterval: ReturnType<typeof setInterval> | null = null;

export function startCertRenewalJob() {
  log.info('CertRenewal', 'Starting SSL certificate renewal job');

  // Initial check after 60 seconds
  renewalTimeout = setTimeout(() => checkAndRenew(), 60000);

  // Then check periodically
  renewalInterval = setInterval(() => checkAndRenew(), RENEWAL_CHECK_INTERVAL);
}

export function stopCertRenewalJob() {
  if (renewalTimeout) {
    clearTimeout(renewalTimeout);
    renewalTimeout = null;
  }
  if (renewalInterval) {
    clearInterval(renewalInterval);
    renewalInterval = null;
  }
}

async function checkAndRenew() {
  try {
    const certs = await CertificateOperations.getRenewable(DAYS_BEFORE_EXPIRY);

    if (certs.length === 0) {
      log.debug('CertRenewal', 'No certificates need renewal');
      return;
    }

    log.info('CertRenewal', `Found ${certs.length} certificate(s) to renew`);

    for (const cert of certs) {
      try {
        await renewCertificate(cert);
      } catch (err) {
        log.error('CertRenewal', `Failed to renew certificate ${cert.id}: ${cert.domain}`, { error: err });
        
        // Update certificate with error
        await CertificateOperations.update(cert.id as number, {
          last_error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    log.error('CertRenewal', 'Renewal check failed', { error: err });
  }
}

async function renewCertificate(cert: Record<string, unknown>) {
  const certId = cert.id as number;
  const domain = cert.domain as string;
  const domainId = cert.domain_id as number;
  const accountId = cert.account_id as number;

  log.info('CertRenewal', `Renewing certificate for ${domain} (id: ${certId})`);

  // Get domain and account info
  const domainRecord = await DomainOperations.getById(domainId);
  if (!domainRecord) {
    throw new Error(`Domain ${domainId} not found`);
  }

  const account = await DnsAccountOperations.getById(accountId);
  if (!account) {
    throw new Error(`DNS account ${accountId} not found`);
  }

  // Update status to issuing
  await CertificateOperations.update(certId, { status: 'issuing', last_error: null });

  const config = typeof account.config === 'string' ? JSON.parse(account.config as string) : account.config;

  const result = await issueCertificate(
    domain,
    {
      type: account.type as string,
      config: config as Record<string, string>,
      domain: domainRecord.name as string,
      zoneId: (domainRecord.third_id as string) || '',
    },
    false, // production
    cert.acme_account_key as string | undefined,
    cert.acme_account_url as string | undefined,
  );

  // Update certificate with new data
  await CertificateOperations.update(certId, {
    status: 'valid',
    private_key: result.privateKey,
    certificate: result.certificate,
    ca_certificate: result.caCertificate,
    csr: result.csr,
    issuer: result.issuer,
    not_before: result.notBefore,
    not_after: result.notAfter,
    acme_account_url: result.acmeAccountUrl,
    acme_account_key: result.acmeAccountKey,
    last_error: null,
  });

  log.info('CertRenewal', `Certificate renewed successfully for ${domain}`);
}
