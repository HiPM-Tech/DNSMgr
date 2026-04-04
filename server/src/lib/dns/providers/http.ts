import crypto from 'node:crypto';

export type Dict = Record<string, unknown>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: string;
  timeoutMs?: number;
  parseError?: (payload: unknown) => string | undefined;
}

function withQuery(url: string, query?: Record<string, unknown>): string {
  if (!query) return url;
  const u = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    u.searchParams.set(key, String(value));
  }
  return u.toString();
}

function toErrorMessage(status: number, statusText: string, message?: string): string {
  if (message) return message;
  return `HTTP ${status}${statusText ? ` ${statusText}` : ''}`.trim();
}

async function performRequest(url: string, options: RequestOptions): Promise<{ res: Response; text: string }> {
  const timeoutMs = options.timeoutMs ?? 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(withQuery(url, options.query), {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });
    const text = await res.text();
    return { res, text };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function requestJson<T = unknown>(url: string, options: RequestOptions = {}): Promise<T> {
  const { res, text } = await performRequest(url, options);
  let payload: unknown = undefined;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON response: ${text.slice(0, 200)}`);
    }
  }

  const businessError = options.parseError?.(payload);
  if (!res.ok || businessError) {
    throw new Error(toErrorMessage(res.status, res.statusText, businessError));
  }
  return payload as T;
}

type XmlNode = string | Dict | XmlNode[];

function assignNode(target: Dict, key: string, value: XmlNode): void {
  const current = target[key];
  if (current === undefined) {
    target[key] = value;
    return;
  }
  if (Array.isArray(current)) {
    current.push(value);
    target[key] = current;
    return;
  }
  target[key] = [current as XmlNode, value];
}

function parseXml(xml: string): Dict {
  const cleaned = xml
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  const root: Dict = {};
  const stack: Array<{ key: string; node: Dict }> = [{ key: '__root__', node: root }];
  const tokenRegex = /<[^>]+>|[^<]+/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(cleaned))) {
    const token = match[0];
    if (!token) continue;

    if (token.startsWith('</')) {
      stack.pop();
      continue;
    }

    if (token.startsWith('<')) {
      if (token.startsWith('<!') || token.startsWith('<?')) continue;
      const selfClosing = token.endsWith('/>');
      const rawName = token.replace(/^</, '').replace(/\/?>(\s*)$/, '').trim();
      const key = rawName.split(/\s+/)[0];
      if (!key) continue;
      const node: Dict = {};
      assignNode(stack[stack.length - 1].node, key, node);
      if (!selfClosing) {
        stack.push({ key, node });
      }
      continue;
    }

    const value = token.trim();
    if (!value) continue;
    const current = stack[stack.length - 1];
    assignNode(current.node, '#text', value);
  }

  return root;
}

function unwrapTextNode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => unwrapTextNode(item));
  if (!value || typeof value !== 'object') return value;
  const node = value as Dict;
  const keys = Object.keys(node);
  if (keys.length === 1 && keys[0] === '#text') return node['#text'];
  const out: Dict = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = unwrapTextNode(v);
  }
  return out;
}

export async function requestXml<T = unknown>(url: string, options: RequestOptions = {}): Promise<T> {
  const { res, text } = await performRequest(url, options);
  if (!text) {
    throw new Error(toErrorMessage(res.status, res.statusText, 'Empty XML response'));
  }

  const parsed = unwrapTextNode(parseXml(text));
  const businessError = options.parseError?.(parsed);
  if (!res.ok || businessError) {
    throw new Error(toErrorMessage(res.status, res.statusText, businessError));
  }
  return parsed as T;
}

export function percentEncodeRfc3986(value: string): string {
  return encodeURIComponent(value)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

export function buildCanonicalQuery(params: Record<string, unknown>): string {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${percentEncodeRfc3986(key)}=${percentEncodeRfc3986(String(params[key]))}`)
    .join('&');
}

export function buildCanonicalBody(params: Record<string, unknown>): string {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null)
    .sort()
    .map((key) => `${key}=${String(params[key])}`)
    .join('&');
}

export function hmacSignSha1(key: Buffer | string, content: string, encoding: crypto.BinaryToTextEncoding = 'hex'): string {
  return crypto.createHmac('sha1', key).update(content).digest(encoding);
}

export function hmacSignSha256(key: Buffer | string, content: string, encoding: crypto.BinaryToTextEncoding = 'hex'): string {
  return crypto.createHmac('sha256', key).update(content).digest(encoding);
}
