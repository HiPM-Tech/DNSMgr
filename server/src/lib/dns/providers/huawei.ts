import crypto from 'node:crypto';
import { DnsAdapter, DnsRecord, DomainInfo, PageResult } from '../DnsInterface';
import { asArray, BaseAdapter, Dict, normalizeRrName, safeString, toNumber, toRecordStatus, uuid } from './common';

class HuaweiCloudClient {
  constructor(
    private readonly accessKeyId: string,
    private readonly secretAccessKey: string,
    private readonly endpoint: string = 'dns.myhuaweicloud.com'
  ) {}

  private escape(str: string): string {
    return encodeURIComponent(str)
      .replace(/\+/g, '%20')
      .replace(/\*/g, '%2A')
      .replace(/%7E/g, '~');
  }

  private getCanonicalURI(path: string): string {
    if (!path) return '/';
    const parts = path.split('/').map((item) => this.escape(item));
    let canonicalURI = parts.join('/');
    if (!canonicalURI.endsWith('/')) canonicalURI += '/';
    return canonicalURI;
  }

  private getCanonicalQueryString(params: Record<string, string> | null): string {
    if (!params) return '';
    const sorted = Object.keys(params).sort();
    const parts: string[] = [];
    for (const key of sorted) {
      if (params[key] !== undefined && params[key] !== null) {
        parts.push(`${this.escape(key)}=${this.escape(params[key])}`);
      }
    }
    return parts.join('&');
  }

  private getCanonicalHeaders(headers: Record<string, string>): [string, string] {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalized[key.toLowerCase()] = value.trim();
    }
    const sorted = Object.keys(normalized).sort();
    let canonical = '';
    let signed = '';
    for (const key of sorted) {
      canonical += `${key}:${normalized[key]}\n`;
      signed += `${key};`;
    }
    return [canonical, signed.slice(0, -1)];
  }

  private generateSign(
    method: string,
    path: string,
    query: Record<string, string> | null,
    headers: Record<string, string>,
    body: string,
    timestamp: number
  ): string {
    const algorithm = 'SDK-HMAC-SHA256';
    const date = new Date(timestamp * 1000).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

    const canonicalURI = this.getCanonicalURI(path);
    const canonicalQuery = this.getCanonicalQueryString(query);
    const [canonicalHeaders, signedHeaders] = this.getCanonicalHeaders(headers);
    const hashedPayload = crypto.createHash('sha256').update(body).digest('hex');

    const canonicalRequest = `${method}\n${canonicalURI}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;

    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `${algorithm}\n${date}\n${hashedCanonicalRequest}`;

    const signature = crypto.createHmac('sha256', this.secretAccessKey).update(stringToSign).digest('hex');

    return `${algorithm} Access=${this.accessKeyId}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  }

  async request<T = Dict>(
    method: string,
    path: string,
    query?: Record<string, string> | null,
    body?: Dict
  ): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

    const headers: Record<string, string> = {
      Host: this.endpoint,
      'X-Sdk-Date': date,
    };

    let bodyStr = '';
    if (body && Object.keys(body).length > 0) {
      headers['Content-Type'] = 'application/json';
      bodyStr = JSON.stringify(body);
    }

    const authorization = this.generateSign(method, path, query || null, headers, bodyStr, timestamp);
    headers['Authorization'] = authorization;

    let url = `https://${this.endpoint}${path}`;
    if (query && Object.keys(query).length > 0) {
      const queryStr = this.getCanonicalQueryString(query);
      if (queryStr) url += '?' + queryStr;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: bodyStr || undefined,
    });

    const data = (await res.json()) as Dict;
    if (!res.ok || data.error_msg || data.message || data.error?.error_msg) {
      const err = safeString(data.error_msg) || safeString(data.message) || safeString(data.error?.error_msg) || `HuaweiCloud request failed: ${res.status}`;
      throw new Error(err);
    }

    return data as T;
  }
}

interface HuaweiConfig {
  AccessKeyId: string;
  SecretAccessKey: string;
  domain?: string;
  domainId?: string;
}

export class HuaweiAdapter extends BaseAdapter {
  private config: HuaweiConfig;
  private client: HuaweiCloudClient;

  constructor(config: Record<string, string>) {
    super();
    this.config = {
      AccessKeyId: safeString(config.AccessKeyId),
      SecretAccessKey: safeString(config.SecretAccessKey),
      domain: safeString(config.domain),
      domainId: safeString(config.zoneId),
    };
    this.client = new HuaweiCloudClient(this.config.AccessKeyId, this.config.SecretAccessKey);
  }

  async check(): Promise<boolean> {
    try {
      await this.getDomainList();
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async getDomainList(keyword?: string, page = 1, pageSize = 20): Promise<PageResult<DomainInfo>> {
    try {
      const offset = (page - 1) * pageSize;
      const query: Record<string, string> = {
        offset: String(offset),
        limit: String(pageSize),
      };
      if (keyword) query.name = keyword;

      const data = await this.client.request<{ zones: Array<{ id: string; name: string; record_num: number }>; metadata: { total_count: number } }>(
        'GET',
        '/v2/zones',
        query
      );

      const list = (data.zones || []).map((item) => ({
        Domain: item.name.replace(/\.$/, ''),
        ThirdId: item.id,
        RecordCount: item.record_num,
      }));

      return { total: data.metadata?.total_count || list.length, list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return { total: 0, list: [] };
    }
  }

  async getDomainRecords(
    page = 1,
    pageSize = 20,
    keyword?: string,
    subdomain?: string,
    _value?: string,
    type?: string,
    line?: string,
    status?: number
  ): Promise<PageResult<DnsRecord>> {
    try {
      if (!this.config.domainId) {
        return { total: 0, list: [] };
      }

      const offset = (page - 1) * pageSize;
      const query: Record<string, string> = {
        offset: String(offset),
        limit: String(pageSize),
      };

      if (type) query.type = type;
      if (line) query.line_id = line;
      if (status !== undefined) query.status = status === 1 ? 'ACTIVE' : 'DISABLE';

      if (subdomain) {
        query.name = this.getHost(subdomain);
        query.search_mode = 'equal';
      } else if (keyword) {
        query.name = keyword;
      }

      const data = await this.client.request<{
        recordsets: Dict[];
        metadata: { total_count: number };
      }>('GET', `/v2.1/zones/${this.config.domainId}/recordsets`, query);

      const list = (data.recordsets || []).map((row) => this.mapRecord(row));
      return { total: data.metadata?.total_count || list.length, list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return { total: 0, list: [] };
    }
  }

  async getDomainRecordInfo(recordId: string): Promise<DnsRecord | null> {
    try {
      if (!this.config.domainId) {
        return null;
      }

      const data = await this.client.request<Dict>('GET', `/v2.1/zones/${this.config.domainId}/recordsets/${recordId}`);
      return this.mapRecord(data);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async addDomainRecord(
    name: string,
    type: string,
    value: string,
    line?: string,
    ttl = 600,
    _mx?: number,
    weight?: number,
    remark?: string
  ): Promise<string | null> {
    try {
      if (!this.config.domainId) {
        return null;
      }

      const hostName = this.getHost(name);
      let recordValue = value;
      if (type === 'TXT' && !recordValue.startsWith('"')) {
        recordValue = `"${recordValue}"`;
      }
      const records = recordValue.split(',').reverse();

      const body: Dict = {
        name: hostName,
        type: this.convertType(type),
        records: records,
        line: line || '0',
        ttl: ttl,
        description: remark,
      };

      if (weight && weight > 0) {
        body.weight = weight;
      }

      const data = await this.client.request<{ id: string }>(
        'POST',
        `/v2.1/zones/${this.config.domainId}/recordsets`,
        null,
        body
      );

      return data.id || null;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async updateDomainRecord(
    recordId: string,
    name: string,
    type: string,
    value: string,
    line?: string,
    ttl = 600,
    _mx?: number,
    weight?: number,
    remark?: string
  ): Promise<boolean> {
    try {
      if (!this.config.domainId) {
        return false;
      }

      const hostName = this.getHost(name);
      let recordValue = value;
      if (type === 'TXT' && !recordValue.startsWith('"')) {
        recordValue = `"${recordValue}"`;
      }
      const records = recordValue.split(',').reverse();

      const body: Dict = {
        name: hostName,
        type: this.convertType(type),
        records: records,
        line: line || '0',
        ttl: ttl,
        description: remark,
      };

      if (weight && weight > 0) {
        body.weight = weight;
      }

      await this.client.request('PUT', `/v2.1/zones/${this.config.domainId}/recordsets/${recordId}`, null, body);
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async deleteDomainRecord(recordId: string): Promise<boolean> {
    try {
      if (!this.config.domainId) {
        return false;
      }

      await this.client.request('DELETE', `/v2.1/zones/${this.config.domainId}/recordsets/${recordId}`);
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async setDomainRecordStatus(recordId: string, status: number): Promise<boolean> {
    try {
      const body = { status: status === 1 ? 'ENABLE' : 'DISABLE' };
      await this.client.request('PUT', `/v2.1/recordsets/${recordId}/statuses/set`, null, body);
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async getRecordLines(): Promise<Array<{ id: string; name: string }>> {
    // Return basic lines, full list requires loading from JSON file
    return [
      { id: '0', name: '默认' },
      { id: '1', name: '电信' },
      { id: '2', name: '联通' },
      { id: '3', name: '移动' },
      { id: '4', name: '教育网' },
    ];
  }

  async getMinTTL(): Promise<number> {
    return 1;
  }

  async addDomain(domain: string): Promise<boolean> {
    try {
      const body = { name: domain };
      await this.client.request('POST', '/v2/zones', null, body);
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  private convertType(type: string): string {
    return type;
  }

  private getHost(name: string): string {
    if (name === '@') return `${this.config.domain}.`;
    return `${name}.${this.config.domain}.`;
  }

  private mapRecord(row: Dict): DnsRecord {
    const domain = this.config.domain || '';
    const zoneName = safeString(row.zone_name);
    let name = '';
    const recordName = safeString(row.name);
    if (recordName === `${zoneName}.`) {
      name = '@';
    } else {
      name = recordName.replace(`.${zoneName}.`, '');
    }

    return {
      RecordId: safeString(row.id),
      Domain: zoneName.replace(/\.$/, ''),
      Name: name,
      Type: safeString(row.type),
      Value: Array.isArray(row.records) ? row.records.join(',') : safeString(row.records),
      Line: safeString(row.line) || '0',
      TTL: toNumber(row.ttl, 600),
      MX: row.mx ? toNumber(row.mx, 0) : undefined,
      Status: row.status === 'ACTIVE' ? 1 : 0,
      Weight: row.weight ? toNumber(row.weight, 0) : undefined,
      Remark: safeString(row.description) || undefined,
      UpdateTime: safeString(row.updated_at) || undefined,
    };
  }
}
