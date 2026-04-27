import { 
  DnsRecord, 
  DomainInfo, 
  PageResult,
  asArray,
  Dict,
  normalizeRrName,
  safeString,
  TencentCloudAdapter,
  toNumber,
  toRecordStatus,
  log,
} from '../internal';

export class DnspodAdapter extends TencentCloudAdapter {
  private readonly domain: string;

  constructor(config: Record<string, string>) {
    super(config);
    this.domain = safeString(config.domain);
  }

  protected service(): string {
    return 'dnspod';
  }

  protected endpoint(): string {
    return 'dnspod.tencentcloudapi.com';
  }

  protected version(): string {
    return '2021-03-23';
  }

  private convertLineCode(line?: string): string | undefined {
    const convertDict: Record<string, string> = {
      default: '0',
      unicom: '10=1',
      telecom: '10=0',
      mobile: '10=3',
      edu: '10=2',
      oversea: '3=0',
      btvn: '10=22',
      search: '80=0',
      internal: '7=0',
    };
    if (!line) return undefined;
    return convertDict[line] ?? line;
  }

  private convertType(type?: string): string | undefined {
    if (!type) return type;
    if (type === 'REDIRECT_URL') return '显性URL';
    if (type === 'FORWARD_URL') return '隐性URL';
    return type;
  }

  private convertTypeId(type?: string): string | undefined {
    if (!type) return type;
    if (type === '显性URL') return 'REDIRECT_URL';
    if (type === '隐性URL') return 'FORWARD_URL';
    return type;
  }

  private mapRecord(item: Dict): DnsRecord {
    return {
      RecordId: String(item.RecordId ?? item.RecordID ?? item.Id ?? ''),
      Domain: this.domain,
      Name: normalizeRrName(safeString(item.Name)),
      Type: this.convertTypeId(safeString(item.Type)) || safeString(item.Type),
      Value: safeString(item.Value),
      Line: safeString(item.LineId) || safeString(item.RecordLineId) || safeString(item.Line) || '0',
      TTL: toNumber(item.TTL, 600),
      MX: toNumber(item.MX, 0),
      Status: toRecordStatus(item.Status),
      Weight: item.Weight === undefined ? undefined : toNumber(item.Weight, 0),
      Remark: safeString(item.Remark) || undefined,
      UpdateTime: safeString(item.UpdatedOn) || undefined,
    };
  }

  async check(): Promise<boolean> {
    try {
      await this.call('DescribeDomainList', { Offset: 0, Limit: 1 });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async getDomainList(keyword?: string, page = 1, pageSize = 50): Promise<PageResult<DomainInfo>> {
    try {
      const offset = (page - 1) * pageSize;
      const data = await this.call<Dict>('DescribeDomainList', {
        Offset: offset,
        Limit: pageSize,
        Keyword: keyword || undefined,
      });
      const list = asArray<Dict>(data.DomainList).map((item) => ({
        Domain: safeString(item.Name),
        ThirdId: String(item.DomainId ?? ''),
        RecordCount: item.RecordCount === undefined ? undefined : toNumber(item.RecordCount, 0),
      }));
      const total = toNumber((data.DomainCountInfo as Dict | undefined)?.DomainTotal, list.length);
      return { total, list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      log.error('Dnspod', 'getDomainList failed', this.error);
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
      const offset = (page - 1) * pageSize;
      const hasFilterListPath = status !== undefined || !!value;
      if (hasFilterListPath) {
        const payload: Dict = {
          Domain: this.domain,
          Offset: offset,
          Limit: pageSize,
          SubDomain: subdomain || undefined,
          Keyword: keyword || undefined,
          RecordValue: value || undefined,
          RecordType: type ? [this.convertType(type)] : undefined,
          RecordLine: line ? [line] : undefined,
          RecordStatus: status === undefined ? undefined : [status === 1 ? 'ENABLE' : 'DISABLE'],
        };
        const data = await this.call<Dict>('DescribeRecordFilterList', payload);
        const list = asArray<Dict>(data.RecordList).map((item) => this.mapRecord(item));
        const total = toNumber((data.RecordCountInfo as Dict | undefined)?.TotalCount, list.length);
        return { total, list };
      }

      const data = await this.call<Dict>('DescribeRecordList', {
        Domain: this.domain,
        Subdomain: subdomain || undefined,
        RecordType: this.convertType(type),
        RecordLineId: this.convertLineCode(line),
        Keyword: keyword || undefined,
        Offset: offset,
        Limit: pageSize,
      });
      const list = asArray<Dict>(data.RecordList).map((item) => this.mapRecord(item));
      const total = toNumber((data.RecordCountInfo as Dict | undefined)?.TotalCount, list.length);
      return { total, list };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error = msg;
      if (msg.includes('No records on the list') || msg.includes('记录列表为空')) {
        return { total: 0, list: [] };
      }
      return { total: 0, list: [] };
    }
  }

  async getDomainRecordInfo(recordId: string): Promise<DnsRecord | null> {
    try {
      const data = await this.call<Dict>('DescribeRecord', {
        Domain: this.domain,
        RecordId: toNumber(recordId, 0),
      });
      const info = (data.RecordInfo as Dict | undefined) ?? {};
      return {
        RecordId: String(info.Id ?? recordId),
        Domain: this.domain,
        Name: normalizeRrName(safeString(info.SubDomain)),
        Type: this.convertTypeId(safeString(info.RecordType)) || safeString(info.RecordType),
        Value: safeString(info.Value),
        Line: safeString(info.RecordLineId) || '0',
        TTL: toNumber(info.TTL, 600),
        MX: toNumber(info.MX, 0),
        Status: toNumber(info.Enabled, 1) === 1 ? 1 : 0,
        Weight: info.Weight === undefined ? undefined : toNumber(info.Weight, 0),
        Remark: safeString(info.Remark) || undefined,
        UpdateTime: safeString(info.UpdatedOn) || undefined,
      };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async addDomainRecord(name: string, type: string, value: string, line?: string, ttl = 600, mx = 1, weight?: number, remark?: string): Promise<string | null> {
    try {
      const data = await this.call<Dict>('CreateRecord', {
        Domain: this.domain,
        SubDomain: normalizeRrName(name),
        RecordType: this.convertType(type),
        Value: value,
        RecordLine: line || '0',
        RecordLineId: this.convertLineCode(line),
        TTL: ttl,
        MX: type === 'MX' ? mx : undefined,
        Weight: weight,
      });
      const recordId = String(data.RecordId ?? '');
      if (remark !== undefined && recordId) {
        await this.call('ModifyRecordRemark', {
          Domain: this.domain,
          RecordId: toNumber(recordId, 0),
          Remark: remark,
        });
      }
      return recordId || null;
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
      await this.call('ModifyRecord', {
        Domain: this.domain,
        RecordId: toNumber(recordId, 0),
        SubDomain: normalizeRrName(name),
        RecordType: this.convertType(type),
        Value: value,
        RecordLine: line || '0',
        RecordLineId: this.convertLineCode(line),
        TTL: ttl,
        MX: type === 'MX' ? mx : undefined,
        Weight: weight,
      });
      if (remark !== undefined) {
        await this.call('ModifyRecordRemark', {
          Domain: this.domain,
          RecordId: toNumber(recordId, 0),
          Remark: remark,
        });
      }
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async deleteDomainRecord(recordId: string): Promise<boolean> {
    try {
      await this.call('DeleteRecord', {
        Domain: this.domain,
        RecordId: toNumber(recordId, 0),
      });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async setDomainRecordStatus(recordId: string, status: number): Promise<boolean> {
    try {
      await this.call('ModifyRecordStatus', {
        Domain: this.domain,
        RecordId: toNumber(recordId, 0),
        Status: status === 1 ? 'ENABLE' : 'DISABLE',
      });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async getRecordLines(): Promise<Array<{ id: string; name: string }>> {
    try {
      const data = await this.call<Dict>('DescribeRecordLineCategoryList', { Domain: this.domain });
      const lines: Array<{ id: string; name: string }> = [];

      const walk = (nodes: Dict[]) => {
        for (const node of nodes) {
          const name = safeString(node.LineName);
          const lineId = safeString(node.LineId) || `N.${name}`;
          const useful = Boolean(node.Useful);
          if (useful && lineId && name) lines.push({ id: lineId, name });
          const sub = asArray<Dict>(node.SubGroup);
          if (sub.length > 0) walk(sub);
        }
      };

      walk(asArray<Dict>(data.LineList));
      if (lines.length > 0) return lines;
    } catch {
      // Fallback below.
    }

    try {
      const data = await this.call<Dict>('DescribeRecordLineList', { Domain: this.domain, DomainGrade: '' });
      const lines = asArray<Dict>(data.LineList).map((item) => ({
        id: safeString(item.LineId),
        name: safeString(item.Name),
      }));
      const groups = asArray<Dict>(data.LineGroupList).map((item) => ({
        id: safeString(item.LineId),
        name: safeString(item.Name),
      }));
      const merged = [...lines, ...groups].filter((x) => x.id && x.name);
      return merged.length > 0 ? merged : [{ id: '0', name: '默认' }];
    } catch {
      return [{ id: '0', name: '默认' }];
    }
  }

  async getMinTTL(): Promise<number> {
    try {
      const data = await this.call<Dict>('DescribeDomainPurview', { Domain: this.domain });
      for (const item of asArray<Dict>(data.PurviewList)) {
        const name = safeString(item.Name);
        if (name === '记录 TTL 最低' || name === 'Min TTL value') {
          return toNumber(item.Value, 600);
        }
      }
      return 600;
    } catch {
      return 600;
    }
  }

  async addDomain(domain: string): Promise<boolean> {
    try {
      await this.call('CreateDomain', { Domain: domain });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }
}
