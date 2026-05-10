import { fetchWithFallback } from '../internal';

export interface HiDNSAuthConfig {
  baseUrl: string;
  apiToken: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for HiDNS API
 */
export function buildAuthHeaders(config: HiDNSAuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiToken}`,
  };
}

/**
 * Make an authenticated request to HiDNS API
 */
export async function authenticatedRequest(
  url: string,
  config: HiDNSAuthConfig,
  options: RequestInit = {}
): Promise<Response> {
  const headers = {
    ...buildAuthHeaders(config),
    ...options.headers,
  };

  return fetchWithFallback(
    url,
    {
      ...options,
      headers,
    },
    config.useProxy ?? false,
    'HiDNS'
  );
}

/**
 * Validate HiDNS credentials by listing domains
 */
export async function validateCredentials(config: HiDNSAuthConfig): Promise<boolean> {
  try {
    const baseUrl = config.baseUrl.replace(/\/api\/?$/, '');
    const url = `${baseUrl}/api/domains?page=1&pageSize=1`;
    
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
