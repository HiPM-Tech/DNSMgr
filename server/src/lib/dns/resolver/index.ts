/**
 * DNS 解析模块主入口
 *
 * 功能特性：
 * - 支持 DoH/DoT 加密 DNS 并行竞速查询
 * - 失败自动回退到 UDP/TCP 明文 DNS
 * - 支持代理访问（DoH）
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

export {
  dnsServerRegistry,
  BUILTIN_DNS_SERVERS,
  BUILTIN_PLAIN_DNS_SERVERS,
} from './servers';

export {
  DNSResolver,
  dnsResolver,
} from './resolver';
