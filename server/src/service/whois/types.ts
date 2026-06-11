/** @deprecated 使用 DnsWhoisSource */
export interface WhoisSchedulerResult {
  success: boolean;
  domain: string;
  registrar?: string;
  registrant?: string;
  creation_date?: string;
  expiration_date?: string;
  updated_date?: string;
  name_servers?: string[];
  status?: string[];
  dnssec?: string;
  raw_data?: string;
  [key: string]: any;
}

/** @deprecated 使用 DnsWhoisSource */
export interface WhoisScheduler {
  readonly type: string;
  queryWhois(config: any, domain: string): Promise<WhoisSchedulerResult | null>;
}

/** DNS 提供商 WHOIS 数据源 — 需要账号授权配置 */
export interface DnsWhoisSource {
  readonly type: string;
  query(domain: string, config: any): Promise<WhoisResult | null>;
}

/** WHOIS 查询结果 */
export interface WhoisResult {
  domain: string;
  expiryDate: Date | null;
  creationDate?: Date | null;
  registrar: string | null;
  nameServers: string[];
  raw: string;
  apexExpiryDate?: Date | null;
  apexRegistrar?: string | null;
  status?: string | null;
}

/** WHOIS 适配器接口 — 对应 DnsAdapter */
export interface WhoisAdapter {
  readonly name: string;
  query(domain: string, server: string): Promise<WhoisResult | null>;
}

/** 查询方式类型 */
export type WhoisMethodType = 'whois' | 'rdap' | 'http-api';

/** WHOIS 提供商定义 — 对应 DnsProviderDefinition，但扁平化为简单结构 */
export interface WhoisProviderDefinition {
  name: string;
  suffixes: string[];
  method: WhoisMethodType;
  server: string;
  subdomainOnly?: boolean;
  /** 禁止参与平级查询（queryAll），适用于限定后缀的提供商如 DnsNeko */
  noUplevel?: boolean;
  urlTemplate?: string;
  mapping?: Record<string, any>;
}
