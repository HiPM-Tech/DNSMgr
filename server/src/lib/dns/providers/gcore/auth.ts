export interface GcoreAuthConfig {
  apiKey: string;
  domain?: string;
  zoneId?: string;
  useProxy?: boolean;
}

export function buildAuthHeaders(config: GcoreAuthConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `APIKey ${config.apiKey}`,
  };

  return headers;
}

export async function authenticatedRequest(
  url: string,
  config: GcoreAuthConfig,
  options: RequestInit = {}
): Promise<Response> {
  const headers = buildAuthHeaders(config);
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  return response;
}
