import { DnsAdapter, DnsRecord, DomainInfo, PageResult } from '../DnsInterface';

interface CloudflareConfig {
  email?: string;
  apiKey?: string;
  apiToken?: string;
  zoneId?: string;
  domain?: string;
}

interface CfZone {
  id: string;
  name: string;
  meta?: { total_count?: number };
}

interface CfRecord {
  id: string;
  zone_name: string;
  name: string;
  type: string;
  content: string;
  proxied: boolean;
  ttl: number;
  priority?: number;
  weight?: number;
  comment?: string;
  modified_on?: string;
}

interface CfApiResponse<T> {
  success: boolean;
  result: T;
  result_info?: { total_count: number; count: number; page: number; per_page: number };
  errors?: Array<{ message: string }>;
}

export class CloudflareAdapter implements DnsAdapter {
  private config: CloudflareConfig;
  private error: string = '';
  private baseUrl = 'https://api.cloudflare.com/client/v4';

  constructor(config: CloudflareConfig) {
    this.config = config;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiToken) {
      headers['Authorization'] = `Bearer ${this.config.apiToken}`;
    } else if (this.config.email && this.config.apiKey) {
      headers['X-Auth-Email'] = this.config.email;
      headers['X-Auth-Key'] = this.config.apiKey;
    }
    return headers;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<CfApiResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json()) as CfApiResponse<T>;
    if (!data.success && data.errors?.length) {
      this.error = data.errors[0].message;
    }
    return data;
  }

  async check(): Promise<boolean> {
    try {
      const res = await this.request<CfZone[]>('GET', '/zones?per_page=1');
      if (!res.success) return false;
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  getError(): string {
    return this.error;
  }

  async getDomainList(keyword?: string, page = 1, pageSize = 50): Promise<PageResult<DomainInfo>> {
    let path = `/zones?page=${page}&per_page=${pageSize}`;
    if (keyword) path += `&name=${encodeURIComponent(keyword)}`;
    const res = await this.request<CfZone[]>('GET', path);
    if (!res.success) return { total: 0, list: [] };
    const total = res.result_info?.total_count ?? res.result.length;
    return {
      total,
      list: res.result.map((z) => ({
        Domain: z.name,
        ThirdId: z.id,
        RecordCount: undefined,
      })),
    };
  }

  async getDomainRecords(
    page = 1,
    pageSize = 100,
    keyword?: string,
    subdomain?: string,
    value?: string,
    type?: string,
    _line?: string,
    _status?: number
  ): Promise<PageResult<DnsRecord>> {
    if (!this.config.zoneId) return { total: 0, list: [] };
    let path = `/zones/${this.config.zoneId}/dns_records?page=${page}&per_page=${pageSize}`;
    if (type) path += `&type=${encodeURIComponent(type)}`;
    if (subdomain) path += `&name=${encodeURIComponent(subdomain)}`;
    if (value) path += `&content=${encodeURIComponent(value)}`;
    if (keyword) path += `&search=${encodeURIComponent(keyword)}`;

    const res = await this.request<CfRecord[]>('GET', path);
    if (!res.success) return { total: 0, list: [] };
    const total = res.result_info?.total_count ?? res.result.length;
    return {
      total,
      list: res.result.map((r) => this.mapRecord(r)),
    };
  }

  async getDomainRecordInfo(recordId: string): Promise<DnsRecord | null> {
    if (!this.config.zoneId) return null;
    const res = await this.request<CfRecord>('GET', `/zones/${this.config.zoneId}/dns_records/${recordId}`);
    if (!res.success) return null;
    return this.mapRecord(res.result);
  }

  async addDomainRecord(
    name: string,
    type: string,
    value: string,
    _line?: string,
    ttl = 1,
    mx = 0,
    weight?: number,
    remark?: string
  ): Promise<string | null> {
    if (!this.config.zoneId) return null;
    const body: Record<string, unknown> = { name, type, content: value, ttl };
    if (type === 'MX') body['priority'] = mx;
    if (weight !== undefined) body['weight'] = weight;
    if (remark) body['comment'] = remark;
    const res = await this.request<CfRecord>('POST', `/zones/${this.config.zoneId}/dns_records`, body);
    if (!res.success) return null;
    return res.result.id;
  }

  async updateDomainRecord(
    recordId: string,
    name: string,
    type: string,
    value: string,
    _line?: string,
    ttl = 1,
    mx = 0,
    weight?: number,
    remark?: string
  ): Promise<boolean> {
    if (!this.config.zoneId) return false;
    const body: Record<string, unknown> = { name, type, content: value, ttl };
    if (type === 'MX') body['priority'] = mx;
    if (weight !== undefined) body['weight'] = weight;
    if (remark !== undefined) body['comment'] = remark;
    const res = await this.request<CfRecord>('PATCH', `/zones/${this.config.zoneId}/dns_records/${recordId}`, body);
    return res.success;
  }

  async deleteDomainRecord(recordId: string): Promise<boolean> {
    if (!this.config.zoneId) return false;
    const res = await this.request<{ id: string }>('DELETE', `/zones/${this.config.zoneId}/dns_records/${recordId}`);
    return res.success;
  }

  async setDomainRecordStatus(recordId: string, status: number): Promise<boolean> {
    // Cloudflare has no native enable/disable for DNS records.
    // As a workaround, we append '_paused' to the record name when disabling
    // and remove it when re-enabling. This is a convention used by this platform only.
    const info = await this.getDomainRecordInfo(recordId);
    if (!info) return false;
    let name = info.Name.replace(/_paused$/, '');
    if (status === 0) name = `${name}_paused`;
    return this.updateDomainRecord(recordId, name, info.Type, info.Value, info.Line, info.TTL, info.MX);
  }

  getRecordLines(): Promise<Array<{ id: string; name: string }>> {
    return Promise.resolve([
      { id: '0', name: '仅DNS' },
      { id: '1', name: '已代理' },
    ]);
  }

  getMinTTL(): Promise<number> {
    return Promise.resolve(1);
  }

  async addDomain(domain: string): Promise<boolean> {
    const res = await this.request<CfZone>('POST', '/zones', {
      name: domain,
      jump_start: false,
    });
    return res.success;
  }

  private mapRecord(r: CfRecord): DnsRecord {
    return {
      RecordId: r.id,
      Domain: r.zone_name,
      Name: r.name,
      Type: r.type,
      Value: r.content,
      Line: r.proxied ? '1' : '0',
      TTL: r.ttl,
      MX: r.priority ?? 0,
      Status: 1,
      Weight: r.weight,
      Remark: r.comment,
      UpdateTime: r.modified_on,
    };
  }
}
