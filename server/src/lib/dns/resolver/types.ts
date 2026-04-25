/**
 * DNS 解析模块类型定义
 */

export interface DNSRecord {
  name: string;
  type: number;
  ttl: number;
  data: string;
}

export interface DNSResponse {
  answers: DNSRecord[];
  authorities: DNSRecord[];
  additionals: DNSRecord[];
  responseTime: number;
  source: string;
}

export enum DNSQueryType {
  A = 1,
  NS = 2,
  CNAME = 5,
  SOA = 6,
  PTR = 12,
  MX = 15,
  TXT = 16,
  AAAA = 28,
  SRV = 33,
  CAA = 257,
}

export enum DNSServerType {
  DOH = 'doh',    // DNS over HTTPS
  DOT = 'dot',    // DNS over TLS
  UDP = 'udp',    // Plain UDP
  TCP = 'tcp',    // Plain TCP
}

export interface DNSServerConfig {
  name: string;
  type: DNSServerType;
  address: string;  // URL for DoH, host:port for DoT/UDP/TCP
  priority?: number;
  timeout?: number;
  proxyEnabled?: boolean;
}

export interface DNSQueryOptions {
  type?: DNSQueryType;
  timeout?: number;
  useProxy?: boolean;
  preferEncrypted?: boolean;
  retryCount?: number;
}

export interface DNSResolverResult {
  success: boolean;
  records?: DNSRecord[];
  responseTime: number;
  source: string;
  error?: string;
}
