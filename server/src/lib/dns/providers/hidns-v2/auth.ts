import { fetchWithFallback } from '../internal';

export interface HidnsV2AuthConfig {
  baseUrl: string;
  apiToken: string;
  useProxy?: boolean;
}

export function buildAuthHeaders(config: HidnsV2AuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiToken}`,
  };
}

export async function authenticatedRequest(
  url: string,
  config: HidnsV2AuthConfig,
  options: RequestInit = {}
): Promise<Response> {
  const headers = { ...buildAuthHeaders(config), ...options.headers };
  return fetchWithFallback(url, { ...options, headers }, config.useProxy ?? false, 'HiDNS-V2');
}

export async function validateCredentials(config: HidnsV2AuthConfig): Promise<boolean> {
  try {
    const baseUrl = config.baseUrl.replace(/\/api\/?$/, '');
    const url = `${baseUrl}/api/version`;
    const response = await authenticatedRequest(url, config, { method: 'GET' });
    if (!response.ok) return false;
    const body = await response.json();
    return (body.code === 0 || body.code === 200) && body.data?.apiVersion === 'v2';
  } catch {
    return false;
  }
}
