import { fetchWithFallback } from '../internal';
import crypto from 'crypto';

export interface CaihongDnsAuthConfig {
  baseUrl: string;
  uid: string;
  apiKey: string;
  useProxy?: boolean;
}

/**
 * Generate API signature for CaihongDNS
 * sign = md5(uid + timestamp + apiKey)
 */
export function generateSign(uid: string, timestamp: number, apiKey: string): string {
  return crypto.createHash('md5').update(`${uid}${timestamp}${apiKey}`).digest('hex');
}

/**
 * Build authentication parameters for CaihongDNS API
 * Note: CaihongDNS uses query parameter authentication, not headers
 */
export function buildAuthParams(config: CaihongDnsAuthConfig): Record<string, string | number> {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    uid: parseInt(config.uid),
    timestamp,
    sign: generateSign(config.uid, timestamp, config.apiKey),
  };
}

/**
 * Make an authenticated request to CaihongDNS API
 */
export async function authenticatedRequest(
  url: string,
  config: CaihongDnsAuthConfig,
  options: RequestInit = {}
): Promise<Response> {
  // Add auth params to URL query string
  const authParams = buildAuthParams(config);
  const urlObj = new URL(url);
  Object.entries(authParams).forEach(([key, value]) => {
    urlObj.searchParams.set(key, String(value));
  });

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  return fetchWithFallback(
    urlObj.toString(),
    {
      ...options,
      headers,
    },
    config.useProxy ?? false,
    'CaihongDNS'
  );
}

/**
 * Validate CaihongDNS credentials by listing domains
 */
export async function validateCredentials(config: CaihongDnsAuthConfig): Promise<boolean> {
  try {
    const baseUrl = config.baseUrl.replace(/\/api\/?$/, '');
    const url = `${baseUrl}/api/domain/list?page=1&pageSize=1`;
    
    const response = await authenticatedRequest(url, config, {
      method: 'GET',
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.code === 0 || data.code === 200;
  } catch {
    return false;
  }
}
