import { DnsAdapter, DnsRecord, DomainInfo, PageResult } from '../DnsInterface';
import { asArray, Dict, normalizeRrName, safeString, BaseAdapter, toNumber, toRecordStatus } from './common';
import { log } from '../../logger';
import { fetchWithFallback } from '../../proxy-http';

interface DnsheConfig {
  apiKey: string;
  apiSecret: string;
  domain?: string;
  subdomainId?: string;
  useProxy?: boolean;
}

interface DnsheSubdomain {
  id: number;
  subdomain: string;
  rootdomain: string;
  full_domain: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface DnsheRecord {
  id: number;
  name: string;
  type: string;
  content: string;
  ttl: number;
  priority: number | null;
  proxied: boolean;
  status: string;
  created_at: string;
}

interface DnsheApiResponse<T> {
  success: boolean;
  message?: string;
  error?: string;
  count?: number;
  subdomains?: DnsheSubdomain[];
  subdomain?: DnsheSubdomain;
  dns_records?: DnsheRecord[];
  records?: DnsheRecord[];
  record_id?: number;
}

export class DnsheAdapter extends BaseAdapter {
  private config: DnsheConfig;
  private baseUrl = 'https://api005.dnshe.com/index.php?m=domain_hub';

  constructor(config: Record<string, string>) {
    super();
    this.config = {
      apiKey: safeString(config.apiKey),
      apiSecret: safeString(config.apiSecret),
      domain: safeString(config.domain),
      subdomainId: safeString(config.zoneId),
      useProxy: !!config.useProxy,
    };
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.config.apiKey,
      'X-API-Secret': this.config.apiSecret,
    };
  }

  private async request<T>(
    endpoint: string,
    action: string,
    method: 'GET' | 'POST' = 'GET',
    body?: Dict
  ): Promise<DnsheApiResponse<T>> {
    const url = `${this.baseUrl}&endpoint=${endpoint}&action=${action}`;
    
    const options: RequestInit = {
      method,
      headers: this.getHeaders(),
    };

    if (method === 'POST' && body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetchWithFallback(url, options, this.config.useProxy, 'DNSHE');
    const data = (await res.json()) as DnsheApiResponse<T>;
    
    if (!data.success && data.error) {
      this.error = data.error;
    }
    
    return data;
  }

  async check(): Promise<boolean> {
    try {
      const res = await this.request<DnsheSubdomain[]>('subdomains', 'list', 'GET');
      return res.success;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async getDomainList(keyword?: string, page = 1, pageSize = 50): Promise<PageResult<DomainInfo>> {
    try {
      const res = await this.request<DnsheSubdomain[]>('subdomains', 'list', 'GET');
      if (!res.success || !res.subdomains) {
        return { total: 0, list: [] };
      }

      let list = res.subdomains.map((item) => ({
        Domain: item.full_domain,
        ThirdId: String(item.id),
        RecordCount: undefined as number | undefined,
      }));

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase();
        list = list.filter((d) => d.Domain.toLowerCase().includes(lowerKeyword));
      }

      const total = list.length;
      const offset = (page - 1) * pageSize;
      list = list.slice(offset, offset + pageSize);

      return { total, list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      log.error('Dnshe', 'getDomainList failed', this.error);
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
    _line?: string,
    status?: number
  ): Promise<PageResult<DnsRecord>> {
    try {
      if (!this.config.subdomainId) {
        return { total: 0, list: [] };
      }

      const res = await this.request<DnsheRecord[]>('dns_records', 'list', 'GET');
      if (!res.success || !res.records) {
        return { total: 0, list: [] };
      }

      let list = res.records.map((r) => this.mapRecord(r));

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase();
        list = list.filter((r) => 
          r.Name.toLowerCase().includes(lowerKeyword) ||
          r.Value.toLowerCase().includes(lowerKeyword)
        );
      }

      if (subdomain) {
        list = list.filter((r) => r.Name.toLowerCase() === subdomain.toLowerCase());
      }

      if (value) {
        list = list.filter((r) => r.Value.toLowerCase().includes(value.toLowerCase()));
      }

      if (type) {
        list = list.filter((r) => r.Type.toUpperCase() === type.toUpperCase());
      }

      if (status !== undefined) {
        list = list.filter((r) => r.Status === status);
      }

      const total = list.length;
      const offset = (page - 1) * pageSize;
      list = list.slice(offset, offset + pageSize);

      return { total, list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return { total: 0, list: [] };
    }
  }

  async getDomainRecordInfo(recordId: string): Promise<DnsRecord | null> {
    try {
      if (!this.config.subdomainId) {
        return null;
      }

      const res = await this.request<DnsheRecord[]>('dns_records', 'list', 'GET');
      if (!res.success || !res.records) {
        return null;
      }

      const record = res.records.find((r) => String(r.id) === recordId);
      if (!record) {
        return null;
      }

      return this.mapRecord(record);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async addDomainRecord(
    name: string,
    type: string,
    value: string,
    _line?: string,
    ttl = 120,
    mx = 0,
    _weight?: number,
    _remark?: string
  ): Promise<string | null> {
    try {
      if (!this.config.subdomainId) {
        return null;
      }

      const body: Dict = {
        subdomain_id: toNumber(this.config.subdomainId, 0),
        type: type.toUpperCase(),
        content: value,
        ttl,
      };

      if (name && name !== '@') {
        body.name = name;
      }

      if (type.toUpperCase() === 'MX' && mx > 0) {
        body.priority = mx;
      }

      const res = await this.request<{ record_id: number }>('dns_records', 'create', 'POST', body);
      if (!res.success) {
        return null;
      }

      return String(res.record_id ?? '');
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
    _line?: string,
    ttl = 120,
    mx = 0,
    _weight?: number,
    _remark?: string
  ): Promise<boolean> {
    try {
      const body: Dict = {
        record_id: toNumber(recordId, 0),
        content: value,
        ttl,
      };

      if (name && name !== '@') {
        body.name = name;
      }

      if (type.toUpperCase() === 'MX' && mx > 0) {
        body.priority = mx;
      }

      const res = await this.request<Dict>('dns_records', 'update', 'POST', body);
      return res.success;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async deleteDomainRecord(recordId: string): Promise<boolean> {
    try {
      const res = await this.request<Dict>('dns_records', 'delete', 'POST', {
        record_id: toNumber(recordId, 0),
      });
      return res.success;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async setDomainRecordStatus(recordId: string, status: number): Promise<boolean> {
    // DNSHE API 没有直接的启用/禁用记录功能
    // 通过更新记录状态来模拟（如果 API 支持）
    // 这里返回 true 表示操作成功，但实际上 DNSHE 可能不支持此功能
    this.error = 'DNSHE does not support record status toggle';
    return false;
  }

  async getRecordLines(): Promise<Array<{ id: string; name: string }>> {
    // DNSHE 不支持线路选择，返回默认线路
    return [{ id: 'default', name: '默认' }];
  }

  async getMinTTL(): Promise<number> {
    // DNSHE 默认最小 TTL 为 120
    return 120;
  }

  async addDomain(domain: string): Promise<boolean> {
    try {
      // 解析域名获取 subdomain 和 rootdomain
      const parts = domain.split('.');
      if (parts.length < 2) {
        this.error = 'Invalid domain format';
        return false;
      }

      const subdomain = parts[0];
      const rootdomain = parts.slice(1).join('.');

      const res = await this.request<DnsheSubdomain>('subdomains', 'register', 'POST', {
        subdomain,
        rootdomain,
      });

      return res.success;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  private mapRecord(r: DnsheRecord): DnsRecord {
    const domain = this.config.domain || '';
    const name = r.name === domain ? '@' : r.name.replace(`.${domain}`, '');

    return {
      RecordId: String(r.id),
      Domain: domain,
      Name: name || '@',
      Type: safeString(r.type).toUpperCase(),
      Value: safeString(r.content),
      Line: 'default',
      TTL: r.ttl ?? 120,
      MX: r.priority ?? 0,
      Status: r.status === 'active' ? 1 : 0,
      UpdateTime: r.created_at,
    };
  }
}
