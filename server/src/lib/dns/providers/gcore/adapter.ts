import { 
  DnsAdapter, 
  DnsRecord, 
  DomainInfo, 
  PageResult,
  resolveDomainIdHelper,
  log,
} from '../internal';
import { buildAuthHeaders, type GcoreAuthConfig } from './auth';
import { requestJson } from '../http';

interface GcoreZone {
  id: string;
  name: string;
  records_count?: number;
}

interface GcoreRRSet {
  name: string;
  type: string;
  ttl?: number;
  resource_records: Array<{
    content: string[];
    enabled?: boolean;
  }>;
  filter_set_id?: number;
  meta?: Record<string, unknown>;
  pickers?: Array<{
    type: string;
    limit?: number;
    strict?: boolean;
  }>;
  updated_at?: string;
  warning?: string;
  warnings?: Array<{ key: string; message: string }>;
}

interface GcoreApiResponse<T> {
  success?: boolean;
  result?: T;
  results?: T[];
  total?: number;
  error?: string;
  errors?: Array<{ message: string }>;
}

function parseGcoreError(payload: unknown): string | undefined {
  const data = payload as GcoreApiResponse<unknown>;
  if (data?.errors?.length) return data.errors[0].message;
  if (data?.error) return data.error;
  return undefined;
}

export class GcoreAdapter implements DnsAdapter {
  private config: GcoreAuthConfig;
  private error: string = '';
  private baseUrl = 'https://api.gcore.com/dns/v2';

  constructor(config: GcoreAuthConfig) {
    this.config = config;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<GcoreApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    log.providerRequest('Gcore', method, url, body);

    try {
      const data = await requestJson<GcoreApiResponse<T>>(url, {
        method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        headers: buildAuthHeaders(this.config),
        body: body ? JSON.stringify(body) : undefined,
        useProxy: this.config.useProxy ?? false,
        providerName: 'Gcore',
        parseError: parseGcoreError,
      });
      return data ?? {};
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      this.error = errorMessage;
      log.providerError('Gcore', { error: errorMessage });
      return {} as GcoreApiResponse<T>;
    }
  }

  getError(): string {
    return this.error;
  }

  private async resolveDomainId(): Promise<string | null> {
    return resolveDomainIdHelper(this.config, this.getDomainList.bind(this), 'Gcore');
  }

  async check(): Promise<boolean> {
    const res = await this.request<GcoreZone[]>('GET', '/zones?limit=1');
    return (res.results !== undefined || res.result !== undefined);
  }

  async getDomainList(keyword?: string, page = 1, pageSize = 50): Promise<PageResult<DomainInfo>> {
    try {
      const offset = (page - 1) * pageSize;
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      });
      
      if (keyword) {
        params.set('name', keyword);
      }

      const res = await this.request<any>(
        'GET',
        `/zones?${params.toString()}`
      );

      const zones = Array.isArray(res.results) ? res.results : (Array.isArray(res.result) ? res.result : []);
      const list = zones.map((zone: any) => ({
        Domain: zone.name,
        ThirdId: zone.id,
        RecordCount: zone.records_count,
      }));

      return { total: res.total || list.length, list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      log.error('Gcore', 'getDomainList failed', this.error);
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
      if (!domainId) {
        return { total: 0, list: [] };
      }

      const offset = (page - 1) * pageSize;
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      });

      if (type) {
        params.set('type', type);
      }

      const res = await this.request<any>(
        'GET',
        `/zones/${domainId}/rrsets?${params.toString()}`
      );

      let rrsets: any[] = Array.isArray(res.results) ? res.results : (Array.isArray(res.result) ? res.result : []);
      
      if (subdomain) {
        const lowerSubdomain = subdomain.toLowerCase();
        rrsets = rrsets.filter((rrset: any) => {
          const recordName = rrset.name.toLowerCase();
          return recordName === lowerSubdomain || recordName.endsWith(`.${lowerSubdomain}`);
        });
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase();
        rrsets = rrsets.filter((rrset: any) =>
          rrset.name.toLowerCase().includes(lowerKeyword) ||
          rrset.resource_records.some((rr: any) => 
            rr.content.some((c: string) => c.toLowerCase().includes(lowerKeyword))
          )
        );
      }

      if (value) {
        rrsets = rrsets.filter((rrset: any) =>
          rrset.resource_records.some((rr: any) => rr.content.includes(value))
        );
      }

      const list = rrsets.flatMap((rrset) => this.mapRRSetToRecords(rrset, domainId));

      return { total: res.total || list.length, list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return { total: 0, list: [] };
    }
  }

  private mapRRSetToRecords(rrset: GcoreRRSet, zoneId: string): DnsRecord[] {
    const records: DnsRecord[] = [];
    
    for (const rr of rrset.resource_records) {
      if (!rr.enabled && rr.enabled !== undefined) continue;

      const content = rr.content;
      let value = '';
      let mx = 0;
      let weight = undefined;

      switch (rrset.type.toUpperCase()) {
        case 'SRV':
          if (content.length >= 4) {
            mx = Number(content[0]) || 0;
            weight = Number(content[1]) || 0;
            value = `${content[0]} ${content[1]} ${content[2]} ${content[3]}`;
          }
          break;
        case 'MX':
          if (content.length >= 2) {
            mx = Number(content[0]) || 0;
            value = content[1];
          }
          break;
        default:
          value = content[0] || '';
      }

      records.push({
        RecordId: `${zoneId}:${rrset.name}:${rrset.type}`,
        Domain: this.config.domain || '',
        Name: rrset.name,
        Type: rrset.type.toUpperCase(),
        Value: value,
        Line: '0',
        TTL: rrset.ttl || 3600,
        MX: mx,
        Status: 1,
        Weight: weight,
        Remark: undefined,
        UpdateTime: rrset.updated_at,
      });
    }

    return records;
  }

  async getDomainRecordInfo(recordId: string): Promise<DnsRecord | null> {
    try {
      const domainId = await this.resolveDomainId();
      if (!domainId) return null;

      const parts = recordId.split(':');
      if (parts.length < 3) return null;

      const [, name, type] = parts;
      const res = await this.request<GcoreRRSet>(
        'GET',
        `/zones/${domainId}/${name}/${type}`
      );

      if (!res.result) return null;

      const records = this.mapRRSetToRecords(res.result, domainId);
      return records[0] || null;
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
    ttl = 3600,
    mx = 1,
    weight?: number,
    remark?: string
  ): Promise<string | null> {
    try {
      const domainId = await this.resolveDomainId();
      if (!domainId) return null;

      let content: string[];
      switch (type.toUpperCase()) {
        case 'SRV':
          const srvParts = value.split(/\s+/);
          content = [
            String(mx),
            String(weight || 0),
            srvParts[0] || '0',
            srvParts.slice(1).join(' ') || '',
          ];
          break;
        case 'MX':
          content = [String(mx), value];
          break;
        default:
          content = [value];
      }

      const body = {
        resource_records: [{ content }],
        ttl,
      };

      const res = await this.request<GcoreRRSet>(
        'POST',
        `/zones/${domainId}/${name}/${type.toUpperCase()}`,
        body
      );

      if (!res.result) return null;

      return `${domainId}:${name}:${type.toUpperCase()}`;
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
    ttl = 3600,
    mx = 1,
    weight?: number,
    remark?: string
  ): Promise<boolean> {
    try {
      const domainId = await this.resolveDomainId();
      if (!domainId) return false;

      let content: string[];
      switch (type.toUpperCase()) {
        case 'SRV':
          const srvParts = value.split(/\s+/);
          content = [
            String(mx),
            String(weight || 0),
            srvParts[0] || '0',
            srvParts.slice(1).join(' ') || '',
          ];
          break;
        case 'MX':
          content = [String(mx), value];
          break;
        default:
          content = [value];
      }

      const body = {
        resource_records: [{ content }],
        ttl,
      };

      await this.request<GcoreRRSet>(
        'PUT',
        `/zones/${domainId}/${name}/${type.toUpperCase()}`,
        body
      );

      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async deleteDomainRecord(recordId: string): Promise<boolean> {
    try {
      const domainId = await this.resolveDomainId();
      if (!domainId) return false;

      const parts = recordId.split(':');
      if (parts.length < 3) return false;

      const [, name, type] = parts;

      await this.request(
        'DELETE',
        `/zones/${domainId}/${name}/${type}`
      );

      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async setDomainRecordStatus(recordId: string, status: number): Promise<boolean> {
    try {
      const domainId = await this.resolveDomainId();
      if (!domainId) return false;

      const parts = recordId.split(':');
      if (parts.length < 3) return false;

      const [, name, type] = parts;

      const res = await this.request<GcoreRRSet>(
        'GET',
        `/zones/${domainId}/${name}/${type}`
      );

      if (!res.result) return false;

      const updatedRecords = res.result.resource_records.map((rr) => ({
        ...rr,
        enabled: status === 1,
      }));

      await this.request<GcoreRRSet>(
        'PUT',
        `/zones/${domainId}/${name}/${type}`,
        {
          resource_records: updatedRecords,
          ttl: res.result.ttl,
        }
      );

      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async getRecordLines(): Promise<Array<{ id: string; name: string }>> {
    return [{ id: '0', name: '默认' }];
  }

  async getMinTTL(): Promise<number> {
    return 60;
  }

  async addDomain(domain: string): Promise<boolean> {
    try {
      await this.request('POST', '/zones', { name: domain });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }
}