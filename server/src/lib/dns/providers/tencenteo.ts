import { DnsRecord, DomainInfo, PageResult } from '../DnsInterface';
import {
  asArray,
  buildSrvValue,
  Dict,
  isSrv,
  normalizeRrName,
  parseSrvValue,
  safeString,
  TencentCloudAdapter,
  toNumber,
} from './common';
import { log } from '../../logger';

export class TencenteoAdapter extends TencentCloudAdapter {
  private readonly zoneId: string;
  private readonly domain: string;
  private readonly siteType: string;

  constructor(config: Record<string, string>) {
    super(config);
    this.zoneId = safeString(config.zoneId);
    this.domain = safeString(config.domain);
    this.siteType = safeString(config.site_type).toLowerCase();
  }

  protected service(): string {
    return 'teo';
  }

  protected endpoint(): string {
    return this.siteType === 'intl' ? 'teo.intl.tencentcloudapi.com' : 'teo.tencentcloudapi.com';
  }

  protected version(): string {
    return '2022-09-01';
  }

  private fqdn(name: string): string {
    const rr = normalizeRrName(name);
    return rr === '@' ? this.domain : `${rr}.${this.domain}`;
  }

  private rrFromFqdn(name: string): string {
    const normalized = safeString(name);
    if (!this.domain) return normalizeRrName(normalized);
    if (normalized === this.domain) return '@';
    const suffix = `.${this.domain}`;
    if (normalized.endsWith(suffix)) {
      const rr = normalized.slice(0, -suffix.length);
      return rr || '@';
    }
    return normalizeRrName(normalized);
  }

  private mapRecord(item: Dict): DnsRecord {
    const type = safeString(item.Type);
    const value = isSrv(type)
      ? buildSrvValue(item.Port, item.Content, item.Content)
      : safeString(item.Content) || safeString(item.Value);

    return {
      RecordId: String(item.RecordId ?? ''),
      Domain: this.domain || safeString(item.ZoneName),
      Name: this.rrFromFqdn(safeString(item.Name)),
      Type: type,
      Value: value,
      Line: safeString(item.Location) || 'Default',
      TTL: toNumber(item.TTL, 60),
      MX: toNumber(item.Priority, 0),
      Status: safeString(item.Status).toLowerCase() === 'enable' ? 1 : 0,
      Weight: item.Weight === undefined || toNumber(item.Weight, -1) === -1 ? undefined : toNumber(item.Weight, 0),
      Remark: undefined,
      UpdateTime: safeString(item.ModifiedOn) || undefined,
    };
  }

  async check(): Promise<boolean> {
    try {
      await this.call('DescribeZones', { Offset: 0, Limit: 1, Filters: [{ Name: 'zone-type', Values: ['full'] }] });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async getDomainList(keyword?: string, page = 1, pageSize = 50): Promise<PageResult<DomainInfo>> {
    try {
      const offset = (page - 1) * pageSize;
      const filters: Array<{ Name: string; Values: string[] }> = [{ Name: 'zone-type', Values: ['full'] }];
      if (keyword) filters.push({ Name: 'zone-name', Values: [keyword] });
      const data = await this.call<Dict>('DescribeZones', { Offset: offset, Limit: pageSize, Filters: filters });
      const list = asArray<Dict>(data.Zones).map((zone) => ({
        Domain: safeString(zone.ZoneName),
        ThirdId: safeString(zone.ZoneId),
        RecordCount: 0,
      }));
      return { total: toNumber(data.TotalCount, list.length), list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      log.error('Tencenteo', 'getDomainList failed', this.error);
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
      const offset = (page - 1) * pageSize;
      const filters: Array<{ Name: string; Values: string[]; Fuzzy?: boolean }> = [];
      if (subdomain) filters.push({ Name: 'name', Values: [this.fqdn(subdomain)] });
      else if (keyword) filters.push({ Name: 'name', Values: [this.fqdn(keyword)] });
      if (value) filters.push({ Name: 'content', Values: [value], Fuzzy: true });
      if (type) filters.push({ Name: 'type', Values: [type] });

      const data = await this.call<Dict>('DescribeDnsRecords', {
        ZoneId: this.zoneId,
        Offset: offset,
        Limit: pageSize,
        Filters: filters,
      });
      const list = asArray<Dict>(data.DnsRecords).map((item) => this.mapRecord(item));
      return { total: toNumber(data.TotalCount, list.length), list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return { total: 0, list: [] };
    }
  }

  async getDomainRecordInfo(recordId: string): Promise<DnsRecord | null> {
    try {
      const data = await this.call<Dict>('DescribeDnsRecords', {
        ZoneId: this.zoneId,
        Filters: [{ Name: 'id', Values: [recordId] }],
      });
      const row = asArray<Dict>(data.DnsRecords)[0];
      return row ? this.mapRecord(row) : null;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async addDomainRecord(name: string, type: string, value: string, line?: string, ttl = 600, mx = 1, weight?: number, _remark?: string): Promise<string | null> {
    try {
      const srv = parseSrvValue(value);
      const data = await this.call<Dict>('CreateDnsRecord', {
        ZoneId: this.zoneId,
        Name: this.fqdn(name),
        Type: type,
        Content: isSrv(type) ? srv.target : value,
        Location: line || 'Default',
        TTL: ttl,
        Priority: type === 'MX' ? mx : undefined,
        Weight: weight === undefined ? -1 : weight,
        Port: isSrv(type) ? srv.port : undefined,
      });
      return safeString(data.RecordId) || null;
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
    _remark?: string
  ): Promise<boolean> {
    try {
      const srv = parseSrvValue(value);
      await this.call('ModifyDnsRecord', {
        ZoneId: this.zoneId,
        DnsRecordId: recordId,
        Name: this.fqdn(name),
        Type: type,
        Content: isSrv(type) ? srv.target : value,
        Location: line || 'Default',
        TTL: ttl,
        Priority: type === 'MX' ? mx : undefined,
        Weight: weight === undefined ? -1 : weight,
        Port: isSrv(type) ? srv.port : undefined,
      });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async deleteDomainRecord(recordId: string): Promise<boolean> {
    try {
      await this.call('DeleteDnsRecords', {
        ZoneId: this.zoneId,
        RecordIds: [recordId],
      });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async setDomainRecordStatus(recordId: string, status: number): Promise<boolean> {
    try {
      await this.call('ModifyDnsRecordsStatus', {
        ZoneId: this.zoneId,
        RecordsToEnable: status === 1 ? [recordId] : undefined,
        RecordsToDisable: status === 0 ? [recordId] : undefined,
      });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async getRecordLines(): Promise<Array<{ id: string; name: string }>> {
    return [{ id: 'Default', name: '默认' }];
  }

  async getMinTTL(): Promise<number> {
    return 60;
  }

  async addDomain(_domain: string): Promise<boolean> {
    return false;
  }
}
