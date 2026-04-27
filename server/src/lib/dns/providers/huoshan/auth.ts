import { fetchWithFallback } from '../internal';

export interface HuoshanAuthConfig {
  accessKeyId: string;
  accessKeySecret: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for HUOSHAN API
 * Note: This provider uses signature-based authentication.
 * The actual signing logic is handled in the adapter.
 */
export function buildAuthHeaders(config: HuoshanAuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * Make an authenticated request to HUOSHAN API
 */
export async function authenticatedRequest(
  url: string,
  config: HuoshanAuthConfig,
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
 * Validate HUOSHAN credentials
 */
export async function validateCredentials(config: HuoshanAuthConfig): Promise<boolean> {
  try {
    // TODO: Implement credential validation
    return true;
  } catch {
    return false;
  }
}
