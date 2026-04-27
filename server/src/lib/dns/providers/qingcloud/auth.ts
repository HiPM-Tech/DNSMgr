import { fetchWithFallback } from '../internal';

export interface QingcloudAuthConfig {
  accessKeyId: string;
  accessKeySecret: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for QINGCLOUD API
 * Note: This provider uses signature-based authentication.
 * The actual signing logic is handled in the adapter.
 */
export function buildAuthHeaders(config: QingcloudAuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * Make an authenticated request to QINGCLOUD API
 */
export async function authenticatedRequest(
  url: string,
  config: QingcloudAuthConfig,
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
 * Validate QINGCLOUD credentials
 */
export async function validateCredentials(config: QingcloudAuthConfig): Promise<boolean> {
  try {
    // TODO: Implement credential validation
    return true;
  } catch {
    return false;
  }
}
