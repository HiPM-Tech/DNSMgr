import { log } from '../internal';
import { authenticatedRequest, DnsheAuthConfig } from './auth';

export interface DnsheSubdomain {
  id: number;
  subdomain: string;
  rootdomain: string;
  full_domain: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DnsheSubdomainListResult {
  success: boolean;
  count: number;
  subdomains: DnsheSubdomain[];
}

export interface DnsheRenewalResult {
  success: boolean;
  message?: string;
  subdomain_id: number;
  subdomain: string;
  previous_expires_at: string;
  new_expires_at: string;
  renewed_at: string;
  never_expires: number;
  status: string;
  remaining_days: number;
  charged_amount: number;  // V2.0: Amount deducted from balance (0 for free renewal)
}

/**
 * List all DNSHE subdomains
 */
export async function listSubdomains(
  config: DnsheAuthConfig
): Promise<DnsheSubdomainListResult | null> {
  try {
    const baseUrl = 'https://api005.dnshe.com/index.php';
    const url = `${baseUrl}?m=domain_hub&endpoint=subdomains&action=list`;
    
    log.providerRequest('DNSHE', 'GET', 'subdomains/list');
    
    const response = await authenticatedRequest(url, config, {
      method: 'GET',
    });

    if (!response.ok) {
      const text = await response.text();
      log.providerError('DNSHE', { 
        status: response.status, 
        error: `List subdomains request failed: ${text}` 
      });
      return null;
    }

    const data = await response.json();
    log.providerResponse('DNSHE', response.status, data.success, { count: data.count });
    
    if (!data.success) {
      log.providerError('DNSHE', { message: data.message || data.error });
      return null;
    }

    return data as DnsheSubdomainListResult;
  } catch (error) {
    log.providerError('DNSHE', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * Renew a DNSHE subdomain
 */
export async function renewSubdomain(
  config: DnsheAuthConfig,
  subdomainId: number
): Promise<DnsheRenewalResult | null> {
  try {
    const baseUrl = 'https://api005.dnshe.com/index.php';
    const url = `${baseUrl}?m=domain_hub&endpoint=subdomains&action=renew`;
    
    log.providerRequest('DNSHE', 'POST', 'subdomains/renew', { 
      subdomain_id: subdomainId,
      apiKeyPrefix: config.apiKey?.substring(0, 8) + '...',
      useProxy: config.useProxy
    });
    
    const startTime = Date.now();
    const response = await authenticatedRequest(url, config, {
      method: 'POST',
      body: JSON.stringify({ subdomain_id: subdomainId }),
    });
    const duration = Date.now() - startTime;
    
    log.info('DNSHE', 'Renewal API response time', { duration: `${duration}ms`, status: response.status });

    if (!response.ok) {
      const text = await response.text();
      log.providerError('DNSHE', { 
        status: response.status, 
        error: `Renewal request failed: ${text}`,
        duration: `${duration}ms`
      });
      return null;
    }

    const data = await response.json();
    log.providerResponse('DNSHE', response.status, data.success, { 
      subdomain_id: subdomainId,
      success: data.success,
      message: data.message || data.error,
      previous_expires_at: data.previous_expires_at,
      new_expires_at: data.new_expires_at,
      remaining_days: data.remaining_days,
      charged_amount: data.charged_amount
    });
    
    if (!data.success) {
      log.providerError('DNSHE', { 
        message: data.message || data.error,
        subdomain_id: subdomainId
      });
      return null;
    }

    log.info('DNSHE', 'Renewal successful', {
      subdomain_id: data.subdomain_id,
      subdomain: data.subdomain,
      previousExpiresAt: data.previous_expires_at,
      newExpiresAt: data.new_expires_at,
      remainingDays: data.remaining_days,
      chargedAmount: data.charged_amount,
      neverExpires: data.never_expires
    });

    return data as DnsheRenewalResult;
  } catch (error) {
    log.providerError('DNSHE', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      subdomainId
    });
    return null;
  }
}
