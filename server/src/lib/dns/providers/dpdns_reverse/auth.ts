import { fetchWithFallback } from '../internal';

export interface DpdnsAuthConfig {
  rememberToken: string;
  useProxy?: boolean;
  csrfToken?: string;
  cookieJar?: string;
}

const CSRF_HEADER = 'X-CSRF-Token';
const BASE_URL = 'https://dash.domain.digitalplat.org';

function buildBrowserHeaders(headers?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Origin': BASE_URL,
    'Referer': `${BASE_URL}/`,
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Priority': 'u=1, i',
    'Cache-Control': 'no-cache',
    'DNT': '1',
    ...headers,
  };
}

/** Parse a raw Set-Cookie response header into a name→value map */
function parseSetCookieHeader(raw: string): Map<string, string> {
  const cookies = new Map<string, string>();
  // Each cookie segment starts with name=value — look for that pattern
  // at positions that are NOT preceded by a day-of-week (to skip Expires dates)
  const segments = raw.split(/, (?=[a-zA-Z][a-zA-Z0-9._-]*=)/);
  for (const seg of segments) {
    const m = seg.match(/^([^=]+)=([^;]+)/);
    if (m) cookies.set(m[1].trim(), m[2].trim());
  }
  return cookies;
}

/** Parse semicolon-separated cookie jar (name=value; name=value) into a map */
function parseCookieJar(jar: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!jar) return map;
  for (const part of jar.split('; ')) {
    const idx = part.indexOf('=');
    if (idx > 0) map.set(part.slice(0, idx), part.slice(idx + 1));
  }
  return map;
}

/** Build semicolon-separated cookie jar from a map */
function buildCookieJar(map: Map<string, string>): string | undefined {
  if (map.size === 0) return undefined;
  return Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/** Extract raw Set-Cookie header value from response */
function extractCookies(headers: Headers): string | undefined {
  return headers.get('set-cookie') || undefined;
}

/** Merge response Set-Cookie headers into the cookie jar */
function mergeCookies(existing: string | undefined, fresh: string | undefined): string | undefined {
  if (!fresh) return existing;
  const map = parseCookieJar(existing);
  for (const [k, v] of parseSetCookieHeader(fresh)) {
    map.set(k, v);
  }
  return buildCookieJar(map);
}

function formatCookieHeader(cookieJar: string | undefined, rememberToken: string): string {
  const map = parseCookieJar(cookieJar);
  map.set('remember_token', rememberToken);
  return buildCookieJar(map) ?? '';
}

export async function ensureCsrfToken(config: DpdnsAuthConfig): Promise<string | undefined> {
  if (config.csrfToken) return config.csrfToken;

  try {
    const url = `${BASE_URL}/_panel_api/api/auth/me`;
    const cookieValue = formatCookieHeader(config.cookieJar, config.rememberToken);
    const res = await fetchWithFallback(
      url,
      {
        method: 'GET',
        headers: {
          ...buildBrowserHeaders(),
          Cookie: cookieValue,
        },
      },
      config.useProxy ?? false,
      'DPDNS',
    );

    if (!res.ok) return undefined;

    config.cookieJar = mergeCookies(config.cookieJar, extractCookies(res.headers));

    const parsed = parseCsrfFromCookieJar(config.cookieJar);
    if (parsed) config.csrfToken = parsed;
    return parsed;
  } catch {
    return undefined;
  }
}

function parseCsrfFromCookieJar(cookieJar: string | undefined): string | undefined {
  if (!cookieJar) return undefined;
  const parts = cookieJar.split('; ');
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k === 'panel_csrf_token') return decodeURIComponent(v);
  }
  return undefined;
}

export async function authenticatedRequest(
  url: string,
  config: DpdnsAuthConfig,
  options: RequestInit = {},
): Promise<Response> {
  const headers = buildBrowserHeaders(options.headers as Record<string, string>);

  headers.Cookie = formatCookieHeader(config.cookieJar, config.rememberToken);

  if (config.csrfToken && options.method && options.method !== 'GET' && options.method !== 'HEAD') {
    headers[CSRF_HEADER] = config.csrfToken;
  }

  const res = await fetchWithFallback(
    url,
    { ...options, headers },
    config.useProxy ?? false,
    'DPDNS',
  );

  const fresh = extractCookies(res.headers);
  if (fresh) {
    config.cookieJar = mergeCookies(config.cookieJar, fresh);
    const parsed = parseCsrfFromCookieJar(config.cookieJar);
    if (parsed) config.csrfToken = parsed;
  }

  return res;
}

export async function validateCredentials(config: DpdnsAuthConfig): Promise<boolean> {
  try {
    const url = `${BASE_URL}/_panel_api/api/auth/me`;
    const cookieValue = formatCookieHeader(config.cookieJar, config.rememberToken);
    const response = await fetchWithFallback(
      url,
      {
        method: 'GET',
        headers: {
          ...buildBrowserHeaders(),
          Cookie: cookieValue,
        },
      },
      config.useProxy ?? false,
      'DPDNS',
    );

    if (!response.ok) return false;

    config.cookieJar = mergeCookies(config.cookieJar, extractCookies(response.headers));
    const parsed = parseCsrfFromCookieJar(config.cookieJar);
    if (parsed) config.csrfToken = parsed;

    const data = await response.json();
    return data.ok === true && !!data.user;
  } catch {
    return false;
  }
}
