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