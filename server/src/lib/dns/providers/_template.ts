import { DnsRecord, DomainInfo, PageResult } from '../DnsInterface';
import { BaseAdapter, Dict, normalizeRrName, safeString } from './common';

/**
 * Provider scaffold:
 * 1) 必须实现 mapRecord：将第三方记录映射为 DnsRecord。
 * 2) 必须实现 normalizeLine：统一线路参数。
 * 3) 必须实现 mapProviderError：将第三方错误映射为可读错误文本。
 */
export abstract class ProviderTemplateAdapter extends BaseAdapter {
  protected abstract mapRecord(source: Dict): DnsRecord;
  protected abstract normalizeLine(line?: string): string;
  protected abstract mapProviderError(errorPayload: unknown): string;

  protected normalizeName(name: string): string {
    return normalizeRrName(name);
  }

  protected toError(error: unknown): string {
    if (error instanceof Error) return error.message;
    const mapped = this.mapProviderError(error);
    return mapped || safeString(error);
  }

  async check(): Promise<boolean> { throw new Error('Implement check()'); }
  async getDomainList(_keyword?: string, _page?: number, _pageSize?: number): Promise<PageResult<DomainInfo>> { throw new Error('Implement getDomainList()'); }
  async getDomainRecords(
    _page?: number,
    _pageSize?: number,
    _keyword?: string,
    _subdomain?: string,
    _value?: string,
    _type?: string,
    _line?: string,
    _status?: number
  ): Promise<PageResult<DnsRecord>> { throw new Error('Implement getDomainRecords()'); }
  async getDomainRecordInfo(_recordId: string): Promise<DnsRecord | null> { throw new Error('Implement getDomainRecordInfo()'); }
  async addDomainRecord(
    _name: string,
    _type: string,
    _value: string,
    _line?: string,
    _ttl?: number,
    _mx?: number,
    _weight?: number,
    _remark?: string
  ): Promise<string | null> { throw new Error('Implement addDomainRecord()'); }
  async updateDomainRecord(
    _recordId: string,
    _name: string,
    _type: string,
    _value: string,
    _line?: string,
    _ttl?: number,
    _mx?: number,
    _weight?: number,
    _remark?: string
  ): Promise<boolean> { throw new Error('Implement updateDomainRecord()'); }
  async deleteDomainRecord(_recordId: string): Promise<boolean> { throw new Error('Implement deleteDomainRecord()'); }
  async setDomainRecordStatus(_recordId: string, _status: number): Promise<boolean> { throw new Error('Implement setDomainRecordStatus()'); }
  async getRecordLines(): Promise<Array<{ id: string; name: string }>> { return [{ id: 'default', name: '默认' }]; }
  async getMinTTL(): Promise<number> { return 600; }
  async addDomain(_domain: string): Promise<boolean> { throw new Error('Implement addDomain()'); }
}
