/**
 * WHOIS Service — 主出口
 *
 * 架构：
 * - types.ts         WhoisAdapter / WhoisResult / WhoisProviderDefinition
 * - registry.ts      适配器注册表（factory pattern）+ 提供商数据
 * - methods/         适配器实现（whois / rdap / http-api，无类继承）
 * - lookup.ts        查询编排（分层并行竞速）
 * - data-parser.ts   统一数据解析
 * - checker.ts       域名检查 + 缓存 + 通知
 * - scheduler.ts     定时任务
 * - cache.ts         数据库缓存
 * - adapter.ts       DNS 提供商 WHOIS 适配器
 * - rdap-server-list.ts  IANA RDAP 服务器列表
 * - domain-utils.ts  域名工具
 * - notifier.ts      过期通知
 */

// 核心类型
export {
  WhoisResult,
  WhoisAdapter,
  DnsWhoisSource,
  WhoisProviderDefinition,
  WhoisMethodType,
  WhoisScheduler,
  WhoisSchedulerResult,
} from './types';

// 注册表 + 提供商数据
export {
  getAdapter,
  APEX_PROVIDERS,
  SUBDOMAIN_PROVIDERS,
  THIRD_PARTY_PROVIDERS,
  matchDomain,
  findProviders,
  filterByMethod,
} from './registry';

// 查询编排
export {
  WhoisLookup,
  whoisLookup,
  whoisService,
  queryWhois,
  QueryOptions,
} from './lookup';

// 适配器
export { whoisAdapter } from './methods/whois.adapter';
export { rdapAdapter } from './methods/rdap.adapter';
export { createHttpApiAdapter, HttpApiMapping } from './methods/http-api.adapter';

// DNS 提供商 WHOIS 源
export {
  DnsProviderWhoisRegistry,
  dnsProviderWhoisRegistry,
  initDnsProviderWhoisSources,
} from './methods/dns-provider.registry';

// 数据解析
export {
  parseDate,
  extractStatus,
  extractExpiryDate,
  extractRegistrar,
  extractNameServers,
  isWhoisNotFound,
  extractFromVcard,
  parseWhoisData,
  QueryDataType,
  ParsedWhoisData,
} from './data-parser';

// 缓存
export {
  getCachedWhois,
  setCachedWhois,
  type WhoisResult as CachedWhoisResult,
} from './cache';

// 检查器 + 同步
export {
  checkWhoisForDomain,
  syncDomainWhois,
  type WhoisCheckResult,
} from './checker';

// 定时任务
export {
  initWhoisSchedulers,
  startWhoisJob,
  syncAllDomainsWhois,
} from './scheduler';

// RDAP 服务器列表
export {
  getRdapServerList,
  findRdapServer,
  findRdapServerForDomain,
  refreshRdapServerList,
  getCacheStatus,
  initRdapServerList,
  type RdapServerConfig,
} from './rdap-server-list';

// 域名工具
export { getRootDomain } from './domain-utils';

// 向后兼容（给 lib/dns/providers/dnshe/whoisScheduler.ts 等外部引用）
export { dnsProviderAdapter, initDnsProviderAdapters } from './methods/dns-provider.registry';
