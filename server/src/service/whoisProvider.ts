/**
 * WHOIS Provider 抽象层 (向后兼容)
 * 已迁移到新的架构
 * 
 * 新位置: ./whois/index.ts
 * 
 * 新架构：
 * - providers/     查询方式插件（WHOIS/RDAP）
 * - resolvers/     域名查询商注册列表
 *   - apex-providers.ts      顶域查询商列表
 *   - subdomain-providers.ts 子域查询商列表
 * 
 * 此文件保留用于向后兼容，新代码请使用:
 * import { whoisService, queryWhois, getRootDomain } from './whois';
 */

// 重新导出新的 WHOIS 服务
export {
  whoisService,
  queryWhois,
  getRootDomain,
  WhoisMethod,
  whoisMethod,
  RdapMethod,
  rdapMethod,
  // 顶域查询商
  APEX_WHOIS_PROVIDERS,
  APEX_RDAP_PROVIDERS,
  findApexWhoisProvider,
  findApexRdapProvider,
  addApexWhoisProvider,
  addApexRdapProvider,
  removeApexWhoisProvider,
  removeApexRdapProvider,
  // 第三方查询服务器
  THIRD_PARTY_WHOIS_PROVIDERS,
  THIRD_PARTY_RDAP_PROVIDERS,
  findThirdPartyWhoisProvider,
  findThirdPartyRdapProvider,
  addThirdPartyWhoisProvider,
  addThirdPartyRdapProvider,
  removeThirdPartyWhoisProvider,
  removeThirdPartyRdapProvider,
  // 子域查询商
  SUBDOMAIN_WHOIS_PROVIDERS,
  SUBDOMAIN_RDAP_PROVIDERS,
  findSubdomainWhoisProvider,
  findSubdomainRdapProvider,
  isSubdomainHosted,
  addSubdomainWhoisProvider,
  addSubdomainRdapProvider,
  removeSubdomainWhoisProvider,
  removeSubdomainRdapProvider,
  QueryMethodType,
  BaseQueryMethod,
} from './whois';

export type {
  WhoisResult,
  IQueryMethod,
  ProviderConfig,
  SubdomainProviderConfig,
  QueryOptions,
} from './whois';
