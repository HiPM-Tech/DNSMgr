import crypto from 'node:crypto';
import { DnsRecord, DomainInfo, PageResult } from '../DnsInterface';
import { asArray, BaseAdapter, Dict, normalizeRrName, safeString, toNumber, toRecordStatus, uuid } from './common';

class AliyunRpcClient {
  constructor(private readonly endpoint: string, private readonly accessKeyId: string, private readonly accessKeySecret: string) {}

  private percentEncode(value: string): string {
    return encodeURIComponent(value)
      .replace(/\+/g, '%20')
      .replace(/\*/g, '%2A')
      .replace(/%7E/g, '~');
  }

  private buildSignedQuery(action: string, params: Record<string, unknown>): URLSearchParams {
    const publicParams: Record<string, string> = {
      Action: action,
      Format: 'JSON',
      Version: '2015-01-09',
      AccessKeyId: this.accessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      Timestamp: new Date().toISOString(),
      SignatureVersion: '1.0',
      SignatureNonce: uuid(),
    };

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      publicParams[key] = String(value);
    }

    const sortedKeys = Object.keys(publicParams).sort();
    const canonicalized = sortedKeys
      .map((key) => `${this.percentEncode(key)}=${this.percentEncode(publicParams[key])}`)
      .join('&');

    const stringToSign = `GET&%2F&${this.percentEncode(canonicalized)}`;
    const signature = crypto
      .createHmac('sha1', `${this.accessKeySecret}&`)
      .update(stringToSign)
      .digest('base64');

    const search = new URLSearchParams(publicParams);
    search.set('Signature', signature);
    return search;
  }

  async call<T = Dict>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const query = this.buildSignedQuery(action, params);
    const url = `${this.endpoint}?${query.toString()}`;
    const res = await fetch(url, { method: 'GET' });
    const data = (await res.json()) as Dict;
    if (!res.ok || data.Code) {
      const err = safeString(data.Message) || safeString(data.Code) || `Aliyun action ${action} failed`;
      throw new Error(err);
    }
    return data as T;
  }
}

export class AliyunAdapter extends BaseAdapter {
  private readonly domain: string;
  private readonly client: AliyunRpcClient;

  constructor(config: Record<string, string>) {
    super();
    this.domain = safeString(config.domain);
    const id = safeString(config.AccessKeyId);
    const secret = safeString(config.AccessKeySecret);
    this.client = new AliyunRpcClient('https://alidns.aliyuncs.com/', id, secret);
  }

  private mapRecord(item: Dict): DnsRecord {
    return {
      RecordId: safeString(item.RecordId),
      Domain: safeString(item.DomainName) || this.domain,
      Name: normalizeRrName(safeString(item.RR)),
      Type: safeString(item.Type),
      Value: safeString(item.Value),
      Line: safeString(item.Line) || 'default',
      TTL: toNumber(item.TTL, 600),
      MX: toNumber(item.Priority, 0),
      Status: toRecordStatus(item.Status),
      Weight: item.Weight === undefined ? undefined : toNumber(item.Weight, 0),
      Remark: safeString(item.Remark) || undefined,
      UpdateTime: safeString(item.UpdateTimestamp) || safeString(item.UpdatedAt) || undefined,
    };
  }

  private convertLineCode(line?: string): string | undefined {
    const convertDict: Record<string, string> = {
      '0': 'default',
      '10=1': 'unicom',
      '10=0': 'telecom',
      '10=3': 'mobile',
      '10=2': 'edu',
      '3=0': 'oversea',
      '10=22': 'btvn',
      '80=0': 'search',
      '7=0': 'internal',
    };
    if (!line) return undefined;
    return convertDict[line] ?? line;
  }

  async check(): Promise<boolean> {
    try {
      await this.client.call('DescribeDomains', { PageSize: 1, PageNumber: 1 });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async getDomainList(keyword?: string, page = 1, pageSize = 50): Promise<PageResult<DomainInfo>> {
    try {
      const data = await this.client.call<Dict>('DescribeDomains', {
        PageNumber: page,
        PageSize: pageSize,
        KeyWord: keyword,
      });
      const list = asArray<Dict>((data.Domains as Dict | undefined)?.Domain).map((item) => ({
        Domain: safeString(item.DomainName),
        ThirdId: safeString(item.DomainId),
        RecordCount: item.RecordCount === undefined ? undefined : toNumber(item.RecordCount, 0),
      }));
      return { total: toNumber(data.TotalCount, list.length), list };
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
    line?: string,
    status?: number
  ): Promise<PageResult<DnsRecord>> {
    try {
      const params: Record<string, unknown> = {
        Action: 'DescribeDomainRecords',
        DomainName: this.domain,
        PageNumber: page,
        PageSize: pageSize,
      };
      if (subdomain || value || type || line) {
        params.SearchMode = 'ADVANCED';
        params.RRKeyWord = subdomain;
        params.ValueKeyWord = value;
        params.Type = type;
        params.Line = this.convertLineCode(line);
      } else if (keyword) {
        params.KeyWord = keyword;
      }
      if (status !== undefined) {
        params.Status = status === 1 ? 'Enable' : 'Disable';
      }
      const data = await this.client.call<Dict>('DescribeDomainRecords', params);
      const list = asArray<Dict>((data.DomainRecords as Dict | undefined)?.Record).map((item) => this.mapRecord(item));
      return { total: toNumber(data.TotalCount, list.length), list };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return { total: 0, list: [] };
    }
  }

  async getDomainRecordInfo(recordId: string): Promise<DnsRecord | null> {
    try {
      const data = await this.client.call<Dict>('DescribeDomainRecordInfo', { RecordId: recordId });
      return this.mapRecord(data);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async addDomainRecord(name: string, type: string, value: string, line?: string, ttl = 600, mx = 0, weight?: number, remark?: string): Promise<string | null> {
    try {
      const data = await this.client.call<Dict>('AddDomainRecord', {
        DomainName: this.domain,
        RR: normalizeRrName(name),
        Type: type,
        Value: value,
        Line: this.convertLineCode(line) ?? 'default',
        TTL: ttl,
        Priority: type === 'MX' ? mx : undefined,
        Weight: weight,
      });
      if (remark) {
        await this.client.call('UpdateDomainRecordRemark', { RecordId: safeString(data.RecordId), Remark: remark });
      }
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
    mx = 0,
    weight?: number,
    remark?: string
  ): Promise<boolean> {
    try {
      await this.client.call('UpdateDomainRecord', {
        RecordId: recordId,
        RR: normalizeRrName(name),
        Type: type,
        Value: value,
        Line: this.convertLineCode(line) ?? 'default',
        TTL: ttl,
        Priority: type === 'MX' ? mx : undefined,
        Weight: weight,
      });
      if (remark !== undefined) {
        await this.client.call('UpdateDomainRecordRemark', { RecordId: recordId, Remark: remark });
      }
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async deleteDomainRecord(recordId: string): Promise<boolean> {
    try {
      await this.client.call('DeleteDomainRecord', { RecordId: recordId });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async setDomainRecordStatus(recordId: string, status: number): Promise<boolean> {
    try {
      await this.client.call('SetDomainRecordStatus', {
        RecordId: recordId,
        Status: status === 1 ? 'Enable' : 'Disable',
      });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async getRecordLines(): Promise<Array<{ id: string; name: string }>> {
    try {
      const data = await this.client.call<Dict>('DescribeDomainInfo', {
        DomainName: this.domain,
        NeedDetailAttributes: true,
      });
      const lines = asArray<Dict>((data.RecordLines as Dict | undefined)?.RecordLine).map((row) => ({
        id: safeString(row.LineCode),
        name: safeString(row.LineDisplayName),
      }));
      return lines.length > 0 ? lines : [{ id: 'default', name: '默认' }];
    } catch {
      return [{ id: 'default', name: '默认' }];
    }
  }

  async getMinTTL(): Promise<number> {
    try {
      const data = await this.client.call<Dict>('DescribeDomainInfo', {
        DomainName: this.domain,
        NeedDetailAttributes: true,
      });
      return toNumber(data.MinTtl, 600);
    } catch {
      return 600;
    }
  }

  async addDomain(domain: string): Promise<boolean> {
    try {
      await this.client.call('AddDomain', { DomainName: domain });
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }
}
