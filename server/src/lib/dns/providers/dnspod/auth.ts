import { fetchWithFallback } from '../internal';

export interface DnspodAuthConfig {
  accessKeyId: string;
  accessKeySecret: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for DNSPOD API
 * Note: This provider uses signature-based authentication.
 * The actual signing logic is handled in the adapter.
 */
export function buildAuthHeaders(config: DnspodAuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * Make an authenticated request to DNSPOD API
 */
export async function authenticatedRequest(
  url: string,
  config: DnspodAuthConfig,
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
 * Validate DNSPOD credentials
 */
export async function validateCredentials(config: DnspodAuthConfig): Promise<boolean> {
  try {
    // TODO: Implement credential validation
    return true;
  } catch {
    return false;
  }
}
