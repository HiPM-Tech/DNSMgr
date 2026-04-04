import { DnsAdapter, DnsRecord, DomainInfo, PageResult } from '../DnsInterface';
import { BaseAdapter, Dict, safeString, toNumber } from './common';

interface JdcloudConfig {
  AccessKeyId: string;
  AccessKeySecret: string;
  domain?: string;
}

export class JdcloudAdapter extends BaseAdapter {
  private config: JdcloudConfig;

  constructor(config: Record<string, string>) {
    super();
    this.config = {
      AccessKeyId: safeString(config.AccessKeyId),
      AccessKeySecret: safeString(config.AccessKeySecret),
      domain: safeString(config.domain),
    };
  }

  async check(): Promise<boolean> {
    this.error = 'Jdcloud adapter not fully implemented';
    return false;
  }

  async getDomainList(_keyword?: string, _page = 1, _pageSize = 20): Promise<PageResult<DomainInfo>> {
    return { total: 0, list: [] };
  }

  async getDomainRecords(_page = 1, _pageSize = 20, _keyword?: string, _subdomain?: string, _value?: string, _type?: string, _line?: string, _status?: number): Promise<PageResult<DnsRecord>> {
    return { total: 0, list: [] };
  }

  async getDomainRecordInfo(_recordId: string): Promise<DnsRecord | null> {
    return null;
  }

  async addDomainRecord(_name: string, _type: string, _value: string, _line?: string, _ttl = 600, _mx?: number, _weight?: number, _remark?: string): Promise<string | null> {
    this.error = 'Jdcloud adapter not fully implemented';
    return null;
  }

  async updateDomainRecord(_recordId: string, _name: string, _type: string, _value: string, _line?: string, _ttl = 600, _mx?: number, _weight?: number, _remark?: string): Promise<boolean> {
    this.error = 'Jdcloud adapter not fully implemented';
    return false;
  }

  async deleteDomainRecord(_recordId: string): Promise<boolean> {
    this.error = 'Jdcloud adapter not fully implemented';
    return false;
  }

  async setDomainRecordStatus(_recordId: string, _status: number): Promise<boolean> {
    this.error = 'Jdcloud adapter not fully implemented';
    return false;
  }

  async getRecordLines(): Promise<Array<{ id: string; name: string }>> {
    return [{ id: 'default', name: '默认' }];
  }

  async getMinTTL(): Promise<number> {
    return 600;
  }

  async addDomain(_domain: string): Promise<boolean> {
    this.error = 'Jdcloud adapter not fully implemented';
    return false;
  }
}
