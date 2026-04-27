import { fetchWithFallback } from '../internal';

export interface WestAuthConfig {
  username: string;
  password: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for WEST API
 */
export function buildAuthHeaders(config: WestAuthConfig): Record<string, string> {
  const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${credentials}`,
  };
}

/**
 * Make an authenticated request to WEST API
 */
export async function authenticatedRequest(
  url: string,
  config: WestAuthConfig,
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
 * Validate WEST credentials
 */
export async function validateCredentials(config: WestAuthConfig): Promise<boolean> {
  try {
    // TODO: Implement credential validation
    return true;
  } catch {
    return false;
  }
}
