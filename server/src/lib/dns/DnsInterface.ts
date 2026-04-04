export interface DnsRecord {
  RecordId: string;
  Domain: string;
  Name: string;
  Type: string;
  Value: string;
  Line: string;
  TTL: number;
  MX: number;
  Status: number;
  Proxiable?: boolean;
  Cloudflare?: {
    proxied?: boolean;
    proxiable?: boolean;
  };
  Weight?: number;
  Remark?: string;
  UpdateTime?: string;
}

export interface DomainInfo {
  Domain: string;
  ThirdId: string;
  RecordCount?: number;
}

export interface PageResult<T> {
  total: number;
  list: T[];
}

export interface DnsAdapter {
  check(): Promise<boolean>;
  getError(): string;
  getDomainList(keyword?: string, page?: number, pageSize?: number): Promise<PageResult<DomainInfo>>;
  getDomainRecords(
    page?: number,
    pageSize?: number,
    keyword?: string,
    subdomain?: string,
    value?: string,
    type?: string,
    line?: string,
    status?: number
  ): Promise<PageResult<DnsRecord>>;
  getDomainRecordInfo(recordId: string): Promise<DnsRecord | null>;
  addDomainRecord(
    name: string,
    type: string,
    value: string,
    line?: string,
    ttl?: number,
    mx?: number,
    weight?: number,
    remark?: string
  ): Promise<string | null>;
  updateDomainRecord(
    recordId: string,
    name: string,
    type: string,
    value: string,
    line?: string,
    ttl?: number,
    mx?: number,
    weight?: number,
    remark?: string
  ): Promise<boolean>;
  deleteDomainRecord(recordId: string): Promise<boolean>;
  setDomainRecordStatus(recordId: string, status: number): Promise<boolean>;
  getRecordLines(): Promise<Array<{ id: string; name: string }>>;
  getMinTTL(): Promise<number>;
  addDomain(domain: string): Promise<boolean>;
}
