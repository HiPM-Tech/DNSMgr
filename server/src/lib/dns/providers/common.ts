import crypto from 'node:crypto';
import { DnsAdapter, DnsRecord, DomainInfo, PageResult } from '../DnsInterface';
import {
  Dict,
  buildCanonicalQuery,
  hmacSignSha1,
  requestJson,
} from './http';
import { log } from '../../logger';

export type { Dict };

export function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toRecordStatus(value: unknown): number {
  const normalized = safeString(value).toUpperCase();
  return normalized === 'DISABLE' || normalized === 'DISABLED' ? 0 : 1;
}

export function normalizeRrName(value: string): string {
  const trimmed = safeString(value);
  return trimmed || '@';
}

export function sha256Hex(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

export function hmacSha256Hex(key: Buffer | string, data: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function isSrv(type: string): boolean {
  return safeString(type).toUpperCase() === 'SRV';
}

export function parseSrvValue(value: string): { port?: number; target?: string } {
  const parts = safeString(value).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return {};
  const port = Number(parts[0]);
  if (!Number.isFinite(port)) return {};
  return { port, target: parts.slice(1).join(' ') };
}

export function buildSrvValue(port: unknown, target: unknown, fallback: unknown): string {
  const p = toNumber(port, NaN);
  const t = safeString(target);
  if (Number.isFinite(p) && t) return `${p} ${t}`;
  return safeString(fallback);
}

export abstract class BaseAdapter implements DnsAdapter {
  protected error = '';

  getError(): string {
    return this.error;
  }

  abstract check(): Promise<boolean>;
  abstract getDomainList(keyword?: string, page?: number, pageSize?: number): Promise<PageResult<DomainInfo>>;
  abstract getDomainRecords(
    page?: number,
    pageSize?: number,
    keyword?: string,
    subdomain?: string,
    value?: string,
    type?: string,
    line?: string,
    status?: number
  ): Promise<PageResult<DnsRecord>>;
  abstract getDomainRecordInfo(recordId: string): Promise<DnsRecord | null>;
  abstract addDomainRecord(
    name: string,
    type: string,
    value: string,
    line?: string,
    ttl?: number,
    mx?: number,
    weight?: number,
    remark?: string
  ): Promise<string | null>;
  abstract updateDomainRecord(
    recordId: string,
    name: string,
    type: string,
    value: string,
    line?: string,
    ttl?: number,
    mx?: number,
    weight?: number,
    remark?: string
  ): Promise<boolean>;
  abstract deleteDomainRecord(recordId: string): Promise<boolean>;
  abstract setDomainRecordStatus(recordId: string, status: number): Promise<boolean>;
  abstract getRecordLines(): Promise<Array<{ id: string; name: string }>>;
  abstract getMinTTL(): Promise<number>;
  abstract addDomain(domain: string): Promise<boolean>;
}

export abstract class TokenAuthAdapter extends BaseAdapter {
  protected readonly token: string;

  constructor(config: Record<string, string>, tokenField = 'token') {
    super();
    this.token = safeString(config[tokenField]);
  }

  protected bearerAuth(headers: Record<string, string> = {}): Record<string, string> {
    return {
      ...headers,
      Authorization: `Bearer ${this.token}`,
    };
  }
}

export abstract class AliyunRpcAdapter extends BaseAdapter {
  protected readonly accessKeyId: string;
  protected readonly accessKeySecret: string;

  constructor(config: Record<string, string>) {
    super();
    this.accessKeyId = safeString(config.AccessKeyId);
    this.accessKeySecret = safeString(config.AccessKeySecret);
  }

  protected abstract endpoint(): string;
  protected version(): string {
    return '2015-01-09';
  }

  protected async rpcCall<T = Dict>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const publicParams: Record<string, unknown> = {
      Action: action,
      Format: 'JSON',
      Version: this.version(),
      AccessKeyId: this.accessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      Timestamp: new Date().toISOString(),
      SignatureVersion: '1.0',
      SignatureNonce: uuid(),
      ...params,
    };

    const canonicalized = buildCanonicalQuery(publicParams);
    const stringToSign = `GET&%2F&${encodeURIComponent(canonicalized)}`;
    const signature = hmacSignSha1(`${this.accessKeySecret}&`, stringToSign, 'base64');

    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(publicParams)) {
      if (v === undefined || v === null || v === '') continue;
      query.set(k, String(v));
    }
    query.set('Signature', signature);

    const url = `${this.endpoint()}?${query.toString()}`;
    log.providerRequest('Aliyun', 'GET', url);
    const result = await requestJson<T>(url, {
      method: 'GET',
      parseError: (payload) => {
        const data = (payload ?? {}) as Dict;
        if (data.Code || data.Message) {
          log.providerError('Aliyun', data);
          return safeString(data.Message) || safeString(data.Code) || `Aliyun action ${action} failed`;
        }
        return undefined;
      },
    });
    log.providerResponse('Aliyun', 200, true, { action, hasData: result !== null });
    return result;
  }
}

export abstract class TencentCloudAdapter extends BaseAdapter {
  protected readonly secretId: string;
  protected readonly secretKey: string;

  constructor(config: Record<string, string>) {
    super();
    this.secretId = safeString(config.SecretId);
    this.secretKey = safeString(config.SecretKey);
  }

  protected abstract service(): string;
  protected abstract endpoint(): string;
  protected abstract version(): string;

  protected async call<T = Dict>(action: string, payload: Dict = {}): Promise<T> {
    const host = this.endpoint();
    const method = 'POST';
    const canonicalUri = '/';
    const canonicalQueryString = '';
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const signedHeaders = 'content-type;host;x-tc-action';
    const canonicalHeaders =
      `content-type:application/json; charset=utf-8\n` +
      `host:${host}\n` +
      `x-tc-action:${action.toLowerCase()}\n`;

    const hashedRequestPayload = sha256Hex(body);
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      hashedRequestPayload,
    ].join('\n');

    const credentialScope = `${date}/${this.service()}/tc3_request`;
    const stringToSign = [
      'TC3-HMAC-SHA256',
      String(timestamp),
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const secretDate = hmacSha256(`TC3${this.secretKey}`, date);
    const secretService = hmacSha256(secretDate, this.service());
    const secretSigning = hmacSha256(secretService, 'tc3_request');
    const signature = hmacSha256Hex(secretSigning, stringToSign);
    const authorization =
      `TC3-HMAC-SHA256 Credential=${this.secretId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const url = `https://${host}`;
    log.providerRequest('TencentCloud', 'POST', url, { action });
    const data = await requestJson<Dict>(url, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json; charset=utf-8',
        Host: host,
        'X-TC-Action': action,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Version': this.version(),
      },
      body,
    });

    const response = (data.Response ?? data) as Dict;
    const error = response.Error as Dict | undefined;
    if (error) {
      const code = safeString(error?.Code);
      const msg = safeString(error?.Message) || `TencentCloud action ${action} failed`;
      log.providerError('TencentCloud', error);
      throw new Error(code ? `${code}: ${msg}` : msg);
    }
    log.providerResponse('TencentCloud', 200, true, { action, hasData: response !== null });
    return response as T;
  }
}

export class StubAdapter extends BaseAdapter {
  constructor(private readonly providerName: string) {
    super();
  }

  private err(): Error {
    return new Error(`${this.providerName}: Not implemented`);
  }

  async check(): Promise<boolean> { throw this.err(); }
  async getDomainList(): Promise<PageResult<DomainInfo>> { throw this.err(); }
  async getDomainRecords(): Promise<PageResult<DnsRecord>> { throw this.err(); }
  async getDomainRecordInfo(): Promise<DnsRecord | null> { throw this.err(); }
  async addDomainRecord(): Promise<string | null> { throw this.err(); }
  async updateDomainRecord(): Promise<boolean> { throw this.err(); }
  async deleteDomainRecord(): Promise<boolean> { throw this.err(); }
  async setDomainRecordStatus(): Promise<boolean> { throw this.err(); }
  async getRecordLines(): Promise<Array<{ id: string; name: string }>> { return [{ id: 'default', name: '默认' }]; }
  async getMinTTL(): Promise<number> { return 600; }
  async addDomain(): Promise<boolean> { throw this.err(); }
}
