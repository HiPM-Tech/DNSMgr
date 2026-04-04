import { DnsAdapter, DnsRecord, DomainInfo, PageResult } from '../DnsInterface';
import { BaseAdapter, Dict, safeString, toNumber } from './common';

interface NamesiloConfig {
  apikey: string;
  domain?: string;
}

export class NamesiloAdapter extends BaseAdapter {
  private config: NamesiloConfig;
  private baseUrl = 'https://www.namesilo.com/api';

  constructor(config: Record<string, string>) {
    super();
    this.config = {
      apikey: safeString(config.apikey),
      domain: safeString(config.domain),
    };
  }

  private async request<T>(operation: string, params: Record<string, string> = {}): Promise<T> {
    const query = new URLSearchParams({ version: '1', type: 'json', key: this.config.apikey, ...params });
    const url = `${this.baseUrl}/${operation}?${query.toString()}`;
    const res = await fetch(url);
    const data = (await res.json()) as Dict;
    if (!res.ok || data.reply?.code !== '300') {
      throw new Error(safeString(data.reply?.detail) || `Namesilo request failed: ${res.status}`);
    }
    return data as T;
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

  async getDomainList(keyword?: string, page = 1, pageSize = 50): Promise<PageResult<DomainInfo>> {
    try {
      const data = await this.request<{ reply: { domains: { domain: Array<{ domain: string }> } } }>('listDomains');
      let list = (data.reply?.domains?.domain || []).map((item) => ({
        Domain: item.domain,
        ThirdId: item.domain,
        RecordCount: undefined as number | undefined,
      }));
      if (keyword) {
        list = list.filter((d) => d.Domain.toLowerCase().includes(keyword.toLowerCase()));
      }
      return { total: list.length, list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
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
      if (!this.config.domain) return { total: 0, list: [] };
      const data = await this.request<{ reply: { resource_record: Array<{ record_id: string; host: string; type: string; value: string; ttl: number }> } }>('dnsListRecords', { domain: this.config.domain });
      let list = (data.reply?.resource_record || []).map((r) => this.mapRecord(r));
      if (subdomain) list = list.filter((r) => r.Name.toLowerCase() === subdomain.toLowerCase());
      else if (keyword) {
        const lower = keyword.toLowerCase();
        list = list.filter((r) => r.Name.toLowerCase().includes(lower) || r.Value.toLowerCase().includes(lower));
      }
      if (value) list = list.filter((r) => r.Value === value);
      if (type) list = list.filter((r) => r.Type === type);
      return { total: list.length, list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return { total: 0, list: [] };
    }
  }

  async getDomainRecordInfo(recordId: string): Promise<DnsRecord | null> {
    try {
      const records = await this.getDomainRecords(1, 100);
      return records.list.find((r) => r.RecordId === recordId) || null;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async addDomainRecord(name: string, type: string, value: string, _line?: string, ttl = 7207, _mx?: number, _weight?: number, _remark?: string): Promise<string | null> {
    try {
      if (!this.config.domain) return null;
      await this.request('dnsAddRecord', { domain: this.config.domain, rrtype: type, rrhost: name, rrvalue: value, rrttl: String(ttl) });
      return 'success';
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async updateDomainRecord(recordId: string, name: string, type: string, value: string, _line?: string, ttl = 7207, _mx?: number, _weight?: number, _remark?: string): Promise<boolean> {
    try {
      if (!this.config.domain) return false;
      await this.request('dnsUpdateRecord', { domain: this.config.domain, rrid: recordId, rrhost: name, rrvalue: value, rrttl: String(ttl) });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async deleteDomainRecord(recordId: string): Promise<boolean> {
    try {
      if (!this.config.domain) return false;
      await this.request('dnsDeleteRecord', { domain: this.config.domain, rrid: recordId });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async setDomainRecordStatus(_recordId: string, _status: number): Promise<boolean> {
    this.error = 'NameSilo does not support record status toggle';
    return false;
  }

  async getRecordLines(): Promise<Array<{ id: string; name: string }>> {
    return [{ id: 'default', name: '默认' }];
  }

  async getMinTTL(): Promise<number> {
    return 3600;
  }

  async addDomain(_domain: string): Promise<boolean> {
    this.error = 'NameSilo does not support domain registration via API';
    return false;
  }

  private mapRecord(r: { record_id: string; host: string; type: string; value: string; ttl: number }): DnsRecord {
    const domain = this.config.domain || '';
    return {
      RecordId: r.record_id,
      Domain: domain,
      Name: r.host === '' ? '@' : r.host,
      Type: r.type,
      Value: r.value,
      Line: 'default',
      TTL: r.ttl || 7207,
      MX: 0,
      Status: 1,
    };
  }
}
