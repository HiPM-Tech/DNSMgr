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
  expires_at?: string;  // 到期时间（如果 API 返回）
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
    const baseUrl = 'https://api005.dnshe.com/index.php?m=domain_hub';
    const url = `${baseUrl}&endpoint=subdomains&action=list`;
    
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
    const baseUrl = 'https://api005.dnshe.com/index.php?m=domain_hub';
    const url = `${baseUrl}&endpoint=subdomains&action=renew`;
    
    log.providerRequest('DNSHE', 'POST', 'subdomains/renew', { subdomain_id: subdomainId });
    
    const response = await authenticatedRequest(url, config, {
      method: 'POST',
      body: JSON.stringify({ subdomain_id: subdomainId }),
    });

    if (!response.ok) {
      const text = await response.text();
      log.providerError('DNSHE', { 
        status: response.status, 
        error: `Renewal request failed: ${text}` 
      });
      return null;
    }

    const data = await response.json();
    log.providerResponse('DNSHE', response.status, data.success, { subdomain_id: subdomainId });
    
    if (!data.success) {
      log.providerError('DNSHE', { message: data.message || data.error });
      return null;
    }

    return data as DnsheRenewalResult;
  } catch (error) {
    log.providerError('DNSHE', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
