import { DnsRecord, DomainInfo, PageResult } from '../DnsInterface';
import { BaseAdapter, safeString, toNumber } from './common';
import { requestJson, Dict } from './http';
import { log } from '../../logger';

interface Vps8Config {
  apiKey: string;
  client: string;
  domain?: string;
}

interface Vps8Response<T = unknown> {
  result?: T;
  error?: {
    message?: string;
    code?: number;
  } | null;
}

export class Vps8Adapter extends BaseAdapter {
  private config: Vps8Config;
  private baseUrl = 'https://vps8.zz.cd/api/client/dnsopenapi';

  constructor(config: Record<string, string>) {
    super();
    this.config = {
      apiKey: safeString(config.apiKey) || safeString(config.apikey),
      client: safeString(config.client),
      domain: safeString(config.domain),
    };
  }

  private getHeaders(): Record<string, string> {
    // HTTP Basic Auth: username=client ID, password=apiKey
    // According to VPS8 documentation, 'client' refers to the client ID
    const credentials = Buffer.from(`${this.config.client}:${this.config.apiKey}`).toString('base64');
    return {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(endpoint: string, params: Record<string, unknown> = {}): Promise<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    const body = JSON.stringify(params);
    
    try {
      const response = await requestJson<Vps8Response<T>>(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body,
        parseError: (payload) => {
          const data = payload as Vps8Response;
          if (data.error && data.error.code && data.error.code !== 200) {
            return safeString(data.error.message) || `VPS8 API error: code ${data.error.code}`;
          }
          return undefined;
        },
      });
      
      // 如果响应有 error 字段且不为 null，抛出错误
      const resp = response as Vps8Response;
      if (resp.error && resp.error.code && resp.error.code !== 200) {
        throw new Error(safeString(resp.error.message) || 'VPS8 API request failed');
      }
      
      return (resp.result ?? {}) as T;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(String(error));
    }
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

  async getDomainList(keyword?: string, _page = 1, _pageSize = 50): Promise<PageResult<DomainInfo>> {
    try {
      log.debug('VPS8', 'Fetching domain list', { 
        client: this.config.client,
        apiKeyLength: this.config.apiKey.length,
        baseUrl: this.baseUrl 
      });
      
      const response = await this.request<Array<{ 
        domain: string; 
        id?: string;
        expires_at?: string;
        created_at?: string;
      }>>('domain_list', {});
      
      let list = (response || []).map((item) => ({
        Domain: safeString(item.domain),
        ThirdId: safeString(item.id) || safeString(item.domain),
        RecordCount: undefined as number | undefined,
        ExpiresAt: item.expires_at ? new Date(item.expires_at).toISOString() : undefined,
      }));

      if (keyword) {
        list = list.filter((d) => d.Domain.toLowerCase().includes(keyword.toLowerCase()));
      }

      return { total: list.length, list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      log.error('VPS8', 'getDomainList failed', this.error);
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
    _status?: number
  ): Promise<PageResult<DnsRecord>> {
    try {
      if (!this.config.domain) {
        return { total: 0, list: [] };
      }

      const response = await this.request<Array<Dict>>('record_list', {
        domain: this.config.domain,
      });

      let list = (response || []).map((r) => this.mapRecord(r));

      // 过滤条件
      if (subdomain) {
        list = list.filter((r) => r.Name.toLowerCase() === subdomain.toLowerCase());
      } else if (keyword) {
        const lower = keyword.toLowerCase();
        list = list.filter(
          (r) => r.Name.toLowerCase().includes(lower) || r.Value.toLowerCase().includes(lower)
        );
      }
      if (value) {
        list = list.filter((r) => r.Value === value);
      }
      if (type) {
        list = list.filter((r) => r.Type === type);
      }

      // 分页
      const start = Math.max(0, (page - 1) * pageSize);
      const end = start + pageSize;
      return { total: list.length, list: list.slice(start, end) };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return { total: 0, list: [] };
    }
  }

  async getDomainRecordInfo(recordId: string): Promise<DnsRecord | null> {
    try {
      const records = await this.getDomainRecords(1, 500);
      return records.list.find((r) => r.RecordId === recordId) || null;
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
    ttl = 600,
    mx?: number,
    _weight?: number,
    _remark?: string
  ): Promise<string | null> {
    try {
      if (!this.config.domain) {
        return null;
      }

      const params: Record<string, unknown> = {
        domain: this.config.domain,
        host: name === '@' ? '' : name,
        type: type.toUpperCase(),
        value,
        ttl: toNumber(ttl, 600),
      };

      if (type.toUpperCase() === 'MX' && mx !== undefined) {
        params.mx = mx;
      }

      const response = await this.request<{ id: string }>('record_create', params);
      return safeString(response.id) || 'success';
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      log.error('VPS8', 'addDomainRecord failed', this.error);
      return null;
    }
  }

  async updateDomainRecord(
    recordId: string,
    name: string,
    type: string,
    value: string,
    _line?: string,
    ttl = 600,
    mx?: number,
    _weight?: number,
    _remark?: string
  ): Promise<boolean> {
    try {
      if (!this.config.domain) {
        return false;
      }

      const params: Record<string, unknown> = {
        domain: this.config.domain,
        id: recordId,
        value,
        ttl: toNumber(ttl, 600),
      };

      if (type.toUpperCase() === 'MX' && mx !== undefined) {
        params.mx = mx;
      }

      await this.request('record_update', params);
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      log.error('VPS8', 'updateDomainRecord failed', this.error);
      return false;
    }
  }

  async deleteDomainRecord(recordId: string): Promise<boolean> {
    try {
      if (!this.config.domain) {
        return false;
      }

      await this.request('record_delete', {
        domain: this.config.domain,
        id: recordId,
      });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      log.error('VPS8', 'deleteDomainRecord failed', this.error);
      return false;
    }
  }

  async setDomainRecordStatus(_recordId: string, _status: number): Promise<boolean> {
    this.error = 'VPS8 does not support record status toggle';
    return false;
  }

  async getRecordLines(): Promise<Array<{ id: string; name: string }>> {
    return [{ id: 'default', name: '默认' }];
  }

  async getMinTTL(): Promise<number> {
    return 600;
  }

  async addDomain(_domain: string): Promise<boolean> {
    this.error = 'VPS8 does not support domain registration via API';
    return false;
  }

  private mapRecord(r: Dict): DnsRecord {
    const domain = this.config.domain || '';
    const host = safeString(r.host) || '@';
    const type = safeString(r.type);
    let value = safeString(r.value);
    let mx = 0;

    // 处理 MX 记录
    if (type === 'MX' && r.mx !== undefined) {
      mx = toNumber(r.mx, 0);
    }

    return {
      RecordId: safeString(r.id) || `${type}|${host}|${value}`,
      Domain: domain,
      Name: host,
      Type: type,
      Value: value,
      Line: 'default',
      TTL: toNumber(r.ttl, 600),
      MX: mx,
      Status: 1,
      Weight: undefined,
      Remark: undefined,
      UpdateTime: undefined,
    };
  }
}
