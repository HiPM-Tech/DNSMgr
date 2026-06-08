import { createProviderAdapterLogger, DnsAdapter, DnsRecord, DomainInfo, PageResult, normalizeRrName, safeString, toNumber, resolveDomainIdHelper, Dict } from '../internal';
import { buildAuthHeaders, authenticatedRequest, type DnsnekoAuthConfig } from './auth';

const log = createProviderAdapterLogger('Dnsneko');

interface DnsnekoConfig extends DnsnekoAuthConfig {
  domain?: string;
  domainId?: string;
}

interface DnsnekoApiResponse<T> {
  code: number;
  message?: string;
  data?: T;
}

interface DnsnekoDomain {
  id: number;
  domain: string;
  status: number;
  expireTime?: string;
  recordCount?: number;
  expired?: boolean;
}

interface DnsnekoRecord {
  id: number;
  name: string;
  type: string;
  value: string;
  line: string;
  ttl: number;
  status: number;
  remark?: string;
  priority?: number;
}

export class DnsnekoAdapter implements DnsAdapter {
  private config: DnsnekoConfig;
  private baseUrl = 'https://www.dnsneko.com/api/v1/dns';
  private error: string = '';

  constructor(config: Record<string, string>) {
    this.config = {
      username: safeString(config.username || ''),
      apiKey: safeString(config.apiKey || ''),
      domain: safeString(config.domain),
      domainId: safeString(config.zoneId),
      useProxy: !!config.useProxy,
    };
  }

  getError(): string {
    return this.error;
  }

  private async request<T>(method: string, path: string, params?: Dict): Promise<DnsnekoApiResponse<T>> {
    let url = `${this.baseUrl}${path}`;
    let body: string | undefined;

    if (method === 'GET' && params) {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          query.set(key, String(value));
        }
      }
      url += '?' + query.toString();
    } else if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
      body = JSON.stringify(params);
    }

    log.sub('API').tag('REQUEST').debug('Provider request', { method, url });

    const options: RequestInit = {
      method,
      headers: buildAuthHeaders(this.config),
      body,
    };

    const res = await authenticatedRequest(url, this.config, options);
    const data = (await res.json()) as DnsnekoApiResponse<T>;

    if (!res.ok || data.code !== 200) {
      this.error = data.message || `Request failed: ${res.status}`;
      throw new Error(this.error);
    }

    return data;
  }

  private async resolveDomainId(): Promise<string | null> {
    return resolveDomainIdHelper(this.config, this.getDomainList.bind(this), 'Dnsneko');
  }

  async check(): Promise<boolean> {
    try {
      const data = await this.request<{ domains: DnsnekoDomain[]; pages: number }>('GET', '/domains', { page: 1, size: 1 });
      return data.code === 200;
    } catch {
      return false;
    }
  }

  async getDomainList(keyword?: string, page = 1, pageSize = 50): Promise<PageResult<DomainInfo>> {
    try {
      const data = await this.request<{ domains: DnsnekoDomain[]; pages: number }>('GET', '/domains', { page, size: pageSize });
      const domains = data.data?.domains || [];
      let list = domains.map((item) => ({
        Domain: item.domain,
        ThirdId: String(item.id),
        RecordCount: item.recordCount,
        ExpiresAt: item.expireTime,
      }));

      if (keyword) {
        const lower = keyword.toLowerCase();
        list = list.filter((d) => d.Domain.toLowerCase().includes(lower));
      }

      return { total: domains.length, list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      log.error('getDomainList failed', this.error);
      return { total: 0, list: [] };
    }
  }

  async getDomainRecords(
    page = 1,
    pageSize = 100,
    keyword?: string,
    subdomain?: string,
    value?: string,
    type?: string,
    line?: string,
    status?: number
  ): Promise<PageResult<DnsRecord>> {
    try {
      const domainId = await this.resolveDomainId();
      if (!domainId) return { total: 0, list: [] };

      const params: Dict = { domainId, page, size: pageSize };
      if (type) params.type = type;
      if (keyword) params.keyword = keyword;

      const data = await this.request<{ records: DnsnekoRecord[]; pages: number }>('GET', '/records', params);

      let list = (data.data?.records || []).map((r) => this.mapRecord(r));

      if (subdomain) list = list.filter((r) => r.Name.toLowerCase() === subdomain.toLowerCase());
      if (value) list = list.filter((r) => r.Value.toLowerCase().includes(value.toLowerCase()));
      if (line) list = list.filter((r) => r.Line === line);
      if (status !== undefined) list = list.filter((r) => r.Status === status);

      return { total: list.length, list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return { total: 0, list: [] };
    }
  }

  async getDomainRecordInfo(recordId: string): Promise<DnsRecord | null> {
    try {
      const domainId = await this.resolveDomainId();
      if (!domainId) return null;

      const data = await this.request<{ records: DnsnekoRecord[] }>('GET', '/records', { domainId, page: 1, size: 100 });
      const record = data.data?.records?.find((r) => String(r.id) === recordId);
      return record ? this.mapRecord(record) : null;
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
    mx = 1,
    weight?: number,
    remark?: string
  ): Promise<string | null> {
    try {
      const domainId = await this.resolveDomainId();
      if (!domainId) return null;

      const body: Dict = {
        name: normalizeRrName(name),
        type,
        value,
        line: line || 'default',
        ttl,
        remark,
      };

      if (type === 'MX' || type === 'SRV') body.priority = mx;
      if (weight !== undefined) body.weight = weight;

      const data = await this.request<{ id: number }>('POST', `/records/${domainId}`, body);
      return data.data ? String(data.data.id) : null;
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
    mx = 1,
    weight?: number,
    remark?: string
  ): Promise<boolean> {
    try {
      const domainId = await this.resolveDomainId();
      if (!domainId) return false;

      const body: Dict = {
        name: normalizeRrName(name),
        type,
        value,
        line: line || 'default',
        ttl,
        remark,
      };

      if (type === 'MX' || type === 'SRV') body.priority = mx;
      if (weight !== undefined) body.weight = weight;

      const data = await this.request<unknown>('PUT', `/records/${domainId}/${recordId}`, body);
      return data.code === 200;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async deleteDomainRecord(recordId: string): Promise<boolean> {
    try {
      const domainId = await this.resolveDomainId();
      if (!domainId) return false;

      const data = await this.request<unknown>('DELETE', `/records/${domainId}/${recordId}`);
      return data.code === 200;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async setDomainRecordStatus(recordId: string, status: number): Promise<boolean> {
    try {
      const data = await this.request<unknown>('POST', `/records/${recordId}/status`, { status });
      return data.code === 200;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async getRecordLines(): Promise<Array<{ id: string; name: string }>> {
    return [
      { id: 'default', name: '默认' },
      { id: 'telecom', name: '电信' },
      { id: 'unicom', name: '联通' },
      { id: 'mobile', name: '移动' },
      { id: 'overseas', name: '海外' },
    ];
  }

  async getMinTTL(): Promise<number> {
    return 60;
  }

  async addDomain(domain: string): Promise<boolean> {
    this.error = 'Dnsneko does not support domain registration via API';
    return false;
  }

  private mapRecord(r: DnsnekoRecord): DnsRecord {
    return {
      RecordId: String(r.id),
      Domain: this.config.domain || '',
      Name: normalizeRrName(safeString(r.name)),
      Type: safeString(r.type).toUpperCase(),
      Value: safeString(r.value),
      Line: r.line || 'default',
      TTL: r.ttl ?? 600,
      MX: r.priority ?? 0,
      Status: r.status === 1 ? 1 : 0,
      Remark: safeString(r.remark) || undefined,
    };
  }
}
