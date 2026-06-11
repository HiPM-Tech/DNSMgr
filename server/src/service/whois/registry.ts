/**
 * WHOIS 提供商注册表
 *
 * 仿照 DNS 提供商注册结构 (providers/registry.ts)：
 * - 静态定义 + Map 查找
 * - adapterFactory 模式
 * - 元数据与实现分离
 *
 * 使用方式：
 *   const adapter = getAdapter(definition);
 *   const result = await adapter.query(domain, definition.server);
 */

import { WhoisAdapter, WhoisProviderDefinition, WhoisMethodType } from './types';
import { whoisAdapter } from './methods/whois.adapter';
import { rdapAdapter } from './methods/rdap.adapter';
import { createHttpApiAdapter } from './methods/http-api.adapter';

// ========== 适配器工厂映射 ==========

type AdapterFactory = WhoisAdapter | ((mapping?: any) => WhoisAdapter);

const adapterRegistry = new Map<WhoisMethodType, AdapterFactory>([
  ['whois', whoisAdapter],
  ['rdap', rdapAdapter],
  ['http-api', (mapping?: any) => createHttpApiAdapter(mapping || { domainKey: 'domain', expiryKey: 'expiryDate' })],
]);

/** 根据 ProviderDefinition 获取适配器实例 */
export function getAdapter(definition: WhoisProviderDefinition): WhoisAdapter {
  const factory = adapterRegistry.get(definition.method);
  if (!factory) throw new Error(`Unknown method: ${definition.method}`);

  if (definition.method === 'http-api') {
    return (factory as (mapping?: any) => WhoisAdapter)(definition.mapping);
  }
  return factory as WhoisAdapter;
}

// ========== 提供商数据 ==========
// 仿照 DNS 注册表，所有提供商定义在一个地方

export const APEX_PROVIDERS: WhoisProviderDefinition[] = [
  // --- WHOIS ---
  { name: 'verisign-com-net',     suffixes: ['com', 'net'],                method: 'whois', server: 'whois.verisign-grs.com' },
  { name: 'pir-org-info',         suffixes: ['org', 'info'],               method: 'whois', server: 'whois.publicinterestregistry.org' },
  { name: 'afilias-biz',          suffixes: ['biz'],                       method: 'whois', server: 'whois.biz' },
  { name: 'nic-us',               suffixes: ['us'],                        method: 'whois', server: 'whois.nic.us' },
  { name: 'nic-io',               suffixes: ['io'],                        method: 'whois', server: 'whois.nic.io' },
  { name: 'nic-co',               suffixes: ['co'],                        method: 'whois', server: 'whois.nic.co' },
  { name: 'nic-tv',               suffixes: ['tv'],                        method: 'whois', server: 'whois.nic.tv' },
  { name: 'nic-cc',               suffixes: ['cc'],                        method: 'whois', server: 'whois.nic.cc' },
  { name: 'nic-me',               suffixes: ['me'],                        method: 'whois', server: 'whois.nic.me' },
  { name: 'google-app-dev-page',  suffixes: ['app', 'dev', 'page'],        method: 'whois', server: 'whois.nic.google' },
  { name: 'nic-cloud',            suffixes: ['cloud'],                     method: 'whois', server: 'whois.nic.cloud' },
  { name: 'nic-ai',               suffixes: ['ai'],                        method: 'whois', server: 'whois.whois.ai' },
  { name: 'cnnic-cn',             suffixes: ['cn'],                        method: 'whois', server: 'whois.cnnic.cn' },
  { name: 'nominet-uk',           suffixes: ['uk', 'co.uk', 'org.uk', 'net.uk'], method: 'whois', server: 'whois.nic.uk' },
  { name: 'denic-de',             suffixes: ['de'],                        method: 'whois', server: 'whois.denic.de' },
  { name: 'afnic-fr',             suffixes: ['fr'],                        method: 'whois', server: 'whois.nic.fr' },
  { name: 'eurid-eu',             suffixes: ['eu'],                        method: 'whois', server: 'whois.eu' },
  { name: 'sidn-nl',              suffixes: ['nl'],                        method: 'whois', server: 'whois.sidn.nl' },
  { name: 'tcinet-ru',            suffixes: ['ru', 'su'],                  method: 'whois', server: 'whois.tcinet.ru' },
  { name: 'registro-br',          suffixes: ['br'],                        method: 'whois', server: 'whois.registro.br' },
  { name: 'auda-au',              suffixes: ['au', 'com.au', 'net.au', 'org.au'], method: 'whois', server: 'whois.auda.org.au' },
  { name: 'jprs-jp',              suffixes: ['jp', 'co.jp', 'ne.jp'],      method: 'whois', server: 'whois.jprs.jp' },
  { name: 'kisa-kr',              suffixes: ['kr', 'co.kr'],               method: 'whois', server: 'whois.kr' },
  { name: 'twnic-tw',             suffixes: ['tw', 'com.tw', 'net.tw'],    method: 'whois', server: 'whois.twnic.net.tw' },
  { name: 'hkirc-hk',             suffixes: ['hk', 'com.hk'],              method: 'whois', server: 'whois.hkirc.hk' },
  { name: 'sgnic-sg',             suffixes: ['sg', 'com.sg'],              method: 'whois', server: 'whois.sgnic.sg' },
  { name: 'nic-xyz',              suffixes: ['xyz'],                       method: 'whois', server: 'whois.nic.xyz' },
  { name: 'nic-club',             suffixes: ['club'],                      method: 'whois', server: 'whois.nic.club' },
  { name: 'nic-top',              suffixes: ['top'],                       method: 'whois', server: 'whois.nic.top' },
  { name: 'nic-vip',              suffixes: ['vip'],                       method: 'whois', server: 'whois.nic.vip' },
  { name: 'nic-site',             suffixes: ['site'],                      method: 'whois', server: 'whois.nic.site' },
  { name: 'nic-online',           suffixes: ['online'],                    method: 'whois', server: 'whois.nic.online' },
  { name: 'nic-store',            suffixes: ['store'],                     method: 'whois', server: 'whois.nic.store' },
  { name: 'nic-work',             suffixes: ['work'],                      method: 'whois', server: 'whois.nic.work' },
  { name: 'nic-today',            suffixes: ['today'],                     method: 'whois', server: 'whois.nic.today' },
  // --- RDAP ---
  { name: 'rdap-verisign',  suffixes: ['com', 'net'],     method: 'rdap', server: 'https://rdap.verisign-grs.com/' },
  { name: 'rdap-pir',       suffixes: ['org', 'info'],    method: 'rdap', server: 'https://rdap.publicinterestregistry.org/rdap/' },
  { name: 'rdap-google',    suffixes: ['app', 'dev', 'page'], method: 'rdap', server: 'https://rdap.nic.google/' },
  { name: 'rdap-nic-io',    suffixes: ['io'],             method: 'rdap', server: 'https://rdap.nic.io/' },
  { name: 'rdap-nic-cloud', suffixes: ['cloud'],          method: 'rdap', server: 'https://rdap.nic.cloud/' },
  { name: 'rdap-nic-uk',    suffixes: ['uk'],             method: 'rdap', server: 'https://rdap.nic.uk/' },
  { name: 'rdap-nic-today', suffixes: ['today'],          method: 'rdap', server: 'https://rdap.nic.today/' },
];

export const SUBDOMAIN_PROVIDERS: WhoisProviderDefinition[] = [
  { name: 'digitalplat-whois', suffixes: ['dpdns.org', 'us.kg', 'xx.kg', 'qzz.io', 'qd.je'], method: 'whois', server: 'whois.digitalplat.org', subdomainOnly: true },
  { name: 'digitalplat-rdap',  suffixes: ['dpdns.org', 'us.kg', 'xx.kg', 'qzz.io', 'qd.je'], method: 'rdap',  server: 'https://rdap.digitalplat.org/', subdomainOnly: true },
  {
    name: 'dnsneko', suffixes: ['zh.kg', 'os.kg', 'tw.kg'], method: 'http-api',
    server: 'https://www.dnsneko.com/api/public/whois/query?domain={domain}',
    subdomainOnly: true, noUplevel: true,
    mapping: { dataPath: 'data', domainKey: 'domain', expiryKey: 'expireTime', registerTimeKey: 'registerTime', nameServersKey: 'nameServers', statusKey: 'status' },
  },
];

export const THIRD_PARTY_PROVIDERS: WhoisProviderDefinition[] = [
  { name: 'rdap-box', suffixes: [], method: 'rdap', server: 'https://rdap-box.vercel.app/' },
  {
    name: 'whoiscx', suffixes: [], method: 'http-api',
    server: 'https://api.whoiscx.com/whois/?domain={domain}&raw=1',
    mapping: {
      dataPath: 'data.info',
      domainKey: 'domain',
      expiryKey: 'expiration_time',
      nameServersKey: 'name_server',
      statusKey: 'domain_status',
      registrarKey: 'registrar_name',
    },
  },
];

// ========== 辅助函数 ==========

/** 域名 suffix 匹配 */
export function matchDomain(domain: string, suffixes: string[]): boolean {
  if (suffixes.length === 0) return true; // 空 suffixes 匹配所有
  const lower = domain.toLowerCase();
  return suffixes.some(s => lower === s || lower.endsWith('.' + s));
}

/** 根据域名筛选匹配的提供商 */
export function findProviders(list: WhoisProviderDefinition[], domain: string): WhoisProviderDefinition[] {
  return list.filter(p => matchDomain(domain, p.suffixes));
}

/** 按 method 筛选 */
export function filterByMethod(list: WhoisProviderDefinition[], method: WhoisMethodType): WhoisProviderDefinition[] {
  return list.filter(p => p.method === method);
}

/** 域名是否为子域（相对于某 suffix） */
export function isSubdomainOf(domain: string, suffix: string): boolean {
  const lower = domain.toLowerCase();
  return lower !== suffix && lower.endsWith('.' + suffix);
}

/** 从 IANA RDAP 缓存获取提供商（需要外部注入） */
export type IanaProviderFn = (domain: string) => Promise<WhoisProviderDefinition | null>;
