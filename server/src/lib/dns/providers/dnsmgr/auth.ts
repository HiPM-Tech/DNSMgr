import { fetchWithFallback } from '../internal';

export interface DnsMgrAuthConfig {
  baseUrl: string;
  apiToken: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for DNSMgr API
 */
export function buildAuthHeaders(config: DnsMgrAuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiToken}`,
  };
}

/**
 * Make an authenticated request to DNSMgr API
 */
export async function authenticatedRequest(
  url: string,
  config: DnsMgrAuthConfig,
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
    'DnsMgr'
  );
}

/**
 * Validate DNSMgr credentials by listing domains
 */
export async function validateCredentials(config: DnsMgrAuthConfig): Promise<boolean> {
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
