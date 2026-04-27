import { log } from '../internal';
import { authenticatedRequest, DnsheAuthConfig } from './auth';

export interface DnsheWhoisResult {
  success: boolean;
  message?: string;
  domain: string;
  expires_at?: string;
  registrar?: string;
  status?: string;
  [key: string]: any;
}

/**
 * Get WHOIS information for a DNSHE domain
 */
export async function getWhois(
  config: DnsheAuthConfig,
  domain: string
): Promise<DnsheWhoisResult | null> {
  try {
    const baseUrl = 'https://api005.dnshe.com/index.php?m=domain_hub';
    const url = `${baseUrl}&endpoint=whois&domain=${encodeURIComponent(domain)}`;
    
    log.providerRequest('DNSHE', 'GET', 'whois', { domain });
    
    const response = await authenticatedRequest(url, config, {
      method: 'GET',
    });

    if (!response.ok) {
      const text = await response.text();
      log.providerError('DNSHE', { 
        status: response.status, 
        error: `WHOIS request failed: ${text}` 
      });
      return null;
    }

    const data = await response.json();
    log.providerResponse('DNSHE', response.status, data.success, { domain });
    
    if (!data.success) {
      log.providerError('DNSHE', { message: data.message || data.error });
      return null;
    }

    return data as DnsheWhoisResult;
  } catch (error) {
    log.providerError('DNSHE', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
