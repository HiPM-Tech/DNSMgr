import { fetchWithFallback } from '../internal';

export interface JdcloudAuthConfig {
  accessKeyId: string;
  accessKeySecret: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for JDCLOUD API
 * Note: This provider uses signature-based authentication.
 * The actual signing logic is handled in the adapter.
 */
export function buildAuthHeaders(config: JdcloudAuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * Make an authenticated request to JDCLOUD API
 */
export async function authenticatedRequest(
  url: string,
  config: JdcloudAuthConfig,
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
 * Validate JDCLOUD credentials
 */
export async function validateCredentials(config: JdcloudAuthConfig): Promise<boolean> {
  try {
    // TODO: Implement credential validation
    return true;
  } catch {
    return false;
  }
}
