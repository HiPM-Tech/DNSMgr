import { fetchWithFallback } from '../internal';

export interface DnsnekoAuthConfig {
  username: string;
  apiKey: string;
  useProxy?: boolean;
}

export function buildAuthHeaders(config: DnsnekoAuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-DNSNEKO-USERNAME': config.username,
    'X-DNSNEKO-API-KEY': config.apiKey,
  };
}

export async function authenticatedRequest(
  url: string,
  config: DnsnekoAuthConfig,
  options: RequestInit = {}
): Promise<Response> {
  const headers = { ...buildAuthHeaders(config), ...options.headers };
  return fetchWithFallback(url, { ...options, headers }, config.useProxy ?? false, 'Dnsneko');
}

export async function validateCredentials(config: DnsnekoAuthConfig): Promise<boolean> {
  try {
    const response = await authenticatedRequest('https://www.dnsneko.com/api/v1/dns/domains?page=1&size=1', config);
    if (!response.ok) return false;
    const data = await response.json();
    return data.code === 200;
  } catch {
    return false;
  }
}
