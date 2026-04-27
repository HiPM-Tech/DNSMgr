import { fetchWithFallback } from '../internal';

export interface NamesiloAuthConfig {
  apiKey: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for NAMESILO API
 */
export function buildAuthHeaders(config: NamesiloAuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': config.apiKey,
  };
}

/**
 * Make an authenticated request to NAMESILO API
 */
export async function authenticatedRequest(
  url: string,
  config: NamesiloAuthConfig,
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
 * Validate NAMESILO credentials
 */
export async function validateCredentials(config: NamesiloAuthConfig): Promise<boolean> {
  try {
    // TODO: Implement credential validation
    return true;
  } catch {
    return false;
  }
}
