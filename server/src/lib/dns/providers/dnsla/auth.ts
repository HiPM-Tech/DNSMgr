import { fetchWithFallback } from '../internal';

export interface DnslaAuthConfig {
  apiKey: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for DNSLA API
 */
export function buildAuthHeaders(config: DnslaAuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': config.apiKey,
  };
}

/**
 * Make an authenticated request to DNSLA API
 */
export async function authenticatedRequest(
  url: string,
  config: DnslaAuthConfig,
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
    config.useProxy ?? false
  );
}

/**
 * Validate DNSLA credentials
 */
export async function validateCredentials(config: DnslaAuthConfig): Promise<boolean> {
  try {
    // TODO: Implement credential validation
    return true;
  } catch {
    return false;
  }
}
