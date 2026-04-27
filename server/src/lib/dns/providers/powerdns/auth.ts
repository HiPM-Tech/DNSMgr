import { fetchWithFallback } from '../internal';

export interface PowerdnsAuthConfig {
  apiKey: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for POWERDNS API
 */
export function buildAuthHeaders(config: PowerdnsAuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': config.apiKey,
  };
}

/**
 * Make an authenticated request to POWERDNS API
 */
export async function authenticatedRequest(
  url: string,
  config: PowerdnsAuthConfig,
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
 * Validate POWERDNS credentials
 */
export async function validateCredentials(config: PowerdnsAuthConfig): Promise<boolean> {
  try {
    // TODO: Implement credential validation
    return true;
  } catch {
    return false;
  }
}
