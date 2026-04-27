import { fetchWithFallback } from '../internal';

export interface Vps8AuthConfig {
  username: string;
  password: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for VPS8 API
 */
export function buildAuthHeaders(config: Vps8AuthConfig): Record<string, string> {
  const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${credentials}`,
  };
}

/**
 * Make an authenticated request to VPS8 API
 */
export async function authenticatedRequest(
  url: string,
  config: Vps8AuthConfig,
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
 * Validate VPS8 credentials
 */
export async function validateCredentials(config: Vps8AuthConfig): Promise<boolean> {
  try {
    // TODO: Implement credential validation
    return true;
  } catch {
    return false;
  }
}
