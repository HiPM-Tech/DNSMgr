import { fetchWithFallback } from '../internal';

export interface SpaceshipAuthConfig {
  apiKey: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for SPACESHIP API
 */
export function buildAuthHeaders(config: SpaceshipAuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': config.apiKey,
  };
}

/**
 * Make an authenticated request to SPACESHIP API
 */
export async function authenticatedRequest(
  url: string,
  config: SpaceshipAuthConfig,
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
 * Validate SPACESHIP credentials
 */
export async function validateCredentials(config: SpaceshipAuthConfig): Promise<boolean> {
  try {
    // TODO: Implement credential validation
    return true;
  } catch {
    return false;
  }
}
