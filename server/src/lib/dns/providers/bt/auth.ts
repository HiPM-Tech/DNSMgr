import { fetchWithFallback } from '../internal';

export interface BtAuthConfig {
  username: string;
  password: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for BT API
 */
export function buildAuthHeaders(config: BtAuthConfig): Record<string, string> {
  const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${credentials}`,
  };
}

/**
 * Make an authenticated request to BT API
 */
export async function authenticatedRequest(
  url: string,
  config: BtAuthConfig,
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
 * Validate BT credentials
 */
export async function validateCredentials(config: BtAuthConfig): Promise<boolean> {
  try {
    // TODO: Implement credential validation
    return true;
  } catch {
    return false;
  }
}
