/**
 * 子域查询商注册列表
 * 定义各种子域名托管商的查询服务器
 */

import { QueryMethodType } from '../providers/base';

/**
 * 子域查询商配置
 */
export interface SubdomainProviderConfig {
  /** 查询商名称 */
  name: string;
  /** 支持的域名后缀 */
  suffixes: string[];
  /** 查询方式类型 */
  method: QueryMethodType;
  /** 服务器地址 */
  server: string;
  /** 是否支持查询子域名（true=只支持子域，false=支持所有） */
  subdomainOnly: boolean;
}

/**
 * 子域 WHOIS 查询商列表
 */
export const SUBDOMAIN_WHOIS_PROVIDERS: SubdomainProviderConfig[] = [
  {
    name: 'digitalplat-whois',
    suffixes: ['dpdns.org', 'us.kg', 'xx.kg', 'qzz.io', 'qd.je'],
    method: QueryMethodType.WHOIS,
    server: 'whois.digitalplat.org',
    subdomainOnly: true,
  },
];

/**
 * 子域 RDAP 查询商列表
 */
export const SUBDOMAIN_RDAP_PROVIDERS: SubdomainProviderConfig[] = [
  {
    name: 'digitalplat-rdap',
    suffixes: ['dpdns.org', 'us.kg', 'xx.kg', 'qzz.io', 'qd.je'],
    method: QueryMethodType.RDAP,
    server: 'https://rdap.digitalplat.org/',
    subdomainOnly: true,
  },
];

/**
 * 检查域名是否为子域名（相对于给定的后缀）
 */
function isSubdomain(domain: string, suffix: string): boolean {
  const lowerDomain = domain.toLowerCase();
  const lowerSuffix = suffix.toLowerCase();

  // 域名不能等于后缀本身
  if (lowerDomain === lowerSuffix) return false;

  // 检查是否以 .suffix 结尾
  return lowerDomain.endsWith('.' + lowerSuffix);
}

/**
 * 根据域名查找匹配的子域 WHOIS 查询商
 */
export function findSubdomainWhoisProvider(domain: string): SubdomainProviderConfig | null {
  for (const provider of SUBDOMAIN_WHOIS_PROVIDERS) {
    const isMatch = provider.suffixes.some(suffix => {
      if (provider.subdomainOnly) {
        return isSubdomain(domain, suffix);
      } else {
        const lowerDomain = domain.toLowerCase();
        return lowerDomain === suffix || lowerDomain.endsWith('.' + suffix);
      }
    });

    if (isMatch) {
      return provider;
    }
  }

  return null;
}

/**
 * 根据域名查找匹配的子域 RDAP 查询商
 */
export function findSubdomainRdapProvider(domain: string): SubdomainProviderConfig | null {
  for (const provider of SUBDOMAIN_RDAP_PROVIDERS) {
    const isMatch = provider.suffixes.some(suffix => {
      if (provider.subdomainOnly) {
        return isSubdomain(domain, suffix);
      } else {
        const lowerDomain = domain.toLowerCase();
        return lowerDomain === suffix || lowerDomain.endsWith('.' + suffix);
      }
    });

    if (isMatch) {
      return provider;
    }
  }

  return null;
}

/**
 * 检查域名是否由子域查询商托管
 */
export function isSubdomainHosted(domain: string): boolean {
  return findSubdomainWhoisProvider(domain) !== null ||
         findSubdomainRdapProvider(domain) !== null;
}

/**
 * 添加自定义子域 WHOIS 查询商
 */
export function addSubdomainWhoisProvider(config: SubdomainProviderConfig): void {
  const exists = SUBDOMAIN_WHOIS_PROVIDERS.some(p => p.name === config.name);
  if (exists) {
    console.warn(`[SubdomainProviders] WHOIS provider ${config.name} already exists, skipping`);
    return;
  }

  SUBDOMAIN_WHOIS_PROVIDERS.push(config);
  console.log(`[SubdomainProviders] Added WHOIS provider: ${config.name}`, {
    suffixes: config.suffixes,
    subdomainOnly: config.subdomainOnly,
  });
}

/**
 * 添加自定义子域 RDAP 查询商
 */
export function addSubdomainRdapProvider(config: SubdomainProviderConfig): void {
  const exists = SUBDOMAIN_RDAP_PROVIDERS.some(p => p.name === config.name);
  if (exists) {
    console.warn(`[SubdomainProviders] RDAP provider ${config.name} already exists, skipping`);
    return;
  }

  SUBDOMAIN_RDAP_PROVIDERS.push(config);
  console.log(`[SubdomainProviders] Added RDAP provider: ${config.name}`, {
    suffixes: config.suffixes,
    subdomainOnly: config.subdomainOnly,
  });
}

/**
 * 移除子域 WHOIS 查询商
 */
export function removeSubdomainWhoisProvider(name: string): boolean {
  const index = SUBDOMAIN_WHOIS_PROVIDERS.findIndex(p => p.name === name);
  if (index === -1) return false;

  SUBDOMAIN_WHOIS_PROVIDERS.splice(index, 1);
  console.log(`[SubdomainProviders] Removed WHOIS provider: ${name}`);
  return true;
}

/**
 * 移除子域 RDAP 查询商
 */
export function removeSubdomainRdapProvider(name: string): boolean {
  const index = SUBDOMAIN_RDAP_PROVIDERS.findIndex(p => p.name === name);
  if (index === -1) return false;

  SUBDOMAIN_RDAP_PROVIDERS.splice(index, 1);
  console.log(`[SubdomainProviders] Removed RDAP provider: ${name}`);
  return true;
}
