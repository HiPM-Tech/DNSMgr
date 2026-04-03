import { DnsAdapter, DnsRecord, DomainInfo, PageResult } from '../DnsInterface';

export class StubAdapter implements DnsAdapter {
  protected providerName: string;

  constructor(providerName: string, _config: Record<string, string>) {
    this.providerName = providerName;
  }

  async check(): Promise<boolean> {
    throw new Error(`${this.providerName}: Not implemented`);
  }

  getError(): string {
    return `${this.providerName}: Not implemented`;
  }

  async getDomainList(_keyword?: string, _page?: number, _pageSize?: number): Promise<PageResult<DomainInfo>> {
    throw new Error(`${this.providerName}: Not implemented`);
  }

  async getDomainRecords(): Promise<PageResult<DnsRecord>> {
    throw new Error(`${this.providerName}: Not implemented`);
  }

  async getDomainRecordInfo(_recordId: string): Promise<DnsRecord | null> {
    throw new Error(`${this.providerName}: Not implemented`);
  }

  async addDomainRecord(): Promise<string | null> {
    throw new Error(`${this.providerName}: Not implemented`);
  }

  async updateDomainRecord(): Promise<boolean> {
    throw new Error(`${this.providerName}: Not implemented`);
  }

  async deleteDomainRecord(_recordId: string): Promise<boolean> {
    throw new Error(`${this.providerName}: Not implemented`);
  }

  async setDomainRecordStatus(_recordId: string, _status: number): Promise<boolean> {
    throw new Error(`${this.providerName}: Not implemented`);
  }

  async getRecordLines(): Promise<Array<{ id: string; name: string }>> {
    return [{ id: 'default', name: '默认' }];
  }

  async getMinTTL(): Promise<number> {
    return 600;
  }

  async addDomain(_domain: string): Promise<boolean> {
    throw new Error(`${this.providerName}: Not implemented`);
  }
}

export class AliyunAdapter extends StubAdapter {
  constructor(config: Record<string, string>) { super('aliyun', config); }
}

export class DnspodAdapter extends StubAdapter {
  constructor(config: Record<string, string>) { super('dnspod', config); }
}

export class HuaweiAdapter extends StubAdapter {
  constructor(config: Record<string, string>) { super('huawei', config); }
}

export class BaiduAdapter extends StubAdapter {
  constructor(config: Record<string, string>) { super('baidu', config); }
}

export class HuoshanAdapter extends StubAdapter {
  constructor(config: Record<string, string>) { super('huoshan', config); }
}

export class JdcloudAdapter extends StubAdapter {
  constructor(config: Record<string, string>) { super('jdcloud', config); }
}

export class DnslaAdapter extends StubAdapter {
  constructor(config: Record<string, string>) { super('dnsla', config); }
}

export class WestAdapter extends StubAdapter {
  constructor(config: Record<string, string>) { super('west', config); }
}

export class QingcloudAdapter extends StubAdapter {
  constructor(config: Record<string, string>) { super('qingcloud', config); }
}

export class NamesiloAdapter extends StubAdapter {
  constructor(config: Record<string, string>) { super('namesilo', config); }
}

export class BtAdapter extends StubAdapter {
  constructor(config: Record<string, string>) { super('bt', config); }
}

export class SpaceshipAdapter extends StubAdapter {
  constructor(config: Record<string, string>) { super('spaceship', config); }
}

export class PowerdnsAdapter extends StubAdapter {
  constructor(config: Record<string, string>) { super('powerdns', config); }
}

export class AliyunesaAdapter extends StubAdapter {
  constructor(config: Record<string, string>) { super('aliyunesa', config); }
}

export class TencenteoAdapter extends StubAdapter {
  constructor(config: Record<string, string>) { super('tencenteo', config); }
}
