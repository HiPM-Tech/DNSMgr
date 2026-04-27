import { fetchWithFallback } from '../internal';

export interface AliyunAuthConfig {
  accessKeyId: string;
  accessKeySecret: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for ALIYUN API
 * Note: This provider uses signature-based authentication.
 * The actual signing logic is handled in the adapter.
 */
export function buildAuthHeaders(config: AliyunAuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * Make an authenticated request to ALIYUN API
 */
export async function authenticatedRequest(
  url: string,
  config: AliyunAuthConfig,
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
 * Validate ALIYUN credentials
 */
export async function validateCredentials(config: AliyunAuthConfig): Promise<boolean> {
  try {
    // TODO: Implement credential validation
    return true;
  } catch {
    return false;
  }
}
