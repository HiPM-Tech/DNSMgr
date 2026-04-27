/**
 * DNS 解析模块主入口
 *
 * 功能特性：
 * - 支持 DoH/DoT 加密 DNS 并行竞速查询
 * - 失败自动回退到 UDP/TCP 明文 DNS
 * - 支持代理访问（DoH/DoT）
 * - 全部失败自动交给系统 DNS
 * - 可配置的 DNS 服务器列表
 */

export {
  DNSRecord,
  DNSResponse,
  DNSQueryType,
  DNSServerType,
  DNSServerConfig,
  DNSQueryOptions,
  DNSResolverResult,
} from './types';

// NSLookupResult 类型在 ns-lookup.ts 中定义，避免循环依赖
// 使用时直接导入: import { NSLookupResult } from '../ns-lookup';

export {
  ENCRYPTED_DNS_SERVERS,
  PLAIN_DNS_SERVERS,
  findEncryptedServer,
  findPlainServer,
  getEncryptedServers,
  getPlainServers,
  addEncryptedServer,
  addPlainServer,
  removeServer,
} from './servers';

export {
  DNSResolver,
  dnsResolver,
} from './resolver';

export {
  queryDoH,
  queryDoHWire,
} from './doh-resolver';

export {
  queryDoT,
  queryDoTWithProxy,
} from './dot-resolver';

export {
  queryPlainDNS,
  queryDNSUDP,
  queryDNSTCP,
} from './plain-resolver';

export {
  createProxyTunnel,
  createTLSViaProxy,
  parseProxyUrl,
  type ProxyConfig,
} from './proxy-tunnel';
