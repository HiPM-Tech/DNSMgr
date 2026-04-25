/**
 * 第三方查询服务器注册列表
 * 用于当官方查询失败时的备选
 */

import { QueryMethodType } from '../providers/base';

/**
 * 第三方查询商配置
 */
export interface ThirdPartyProviderConfig {
  /** 查询商名称 */
  name: string;
  /** 支持的域名后缀 */
  suffixes: string[];
  /** 查询方式类型 */
  method: QueryMethodType;
  /** 服务器地址（WHOIS为host:port，RDAP为URL前缀） */
  server: string;
}

/**
 * 第三方 WHOIS 查询商列表
 * 用于当官方查询失败时的备选
 */
export const THIRD_PARTY_WHOIS_PROVIDERS: ThirdPartyProviderConfig[] = [
  // 预留：可添加第三方 WHOIS 服务
  // {
  //   name: 'third-party-whois-example',
  //   suffixes: ['com', 'net', 'org'],
  //   method: QueryMethodType.WHOIS,
  //   server: 'whois.thirdparty.com',
  // },
];

/**
 * 第三方 RDAP 查询商列表
 * 用于当官方查询失败时的备选
 */
export const THIRD_PARTY_RDAP_PROVIDERS: ThirdPartyProviderConfig[] = [
  // 第三方 RDAP 服务：rdap-box
  // 支持所有域名后缀，作为通用备选
  {
    name: 'rdap-box',
    suffixes: [],
    method: QueryMethodType.RDAP,
    server: 'https://rdap-box.vercel.app/',
  },
];

/**
 * 查找第三方 WHOIS 查询商
 */
export function findThirdPartyWhoisProvider(domain: string): ThirdPartyProviderConfig | null {
  const lowerDomain = domain.toLowerCase();

  for (const provider of THIRD_PARTY_WHOIS_PROVIDERS) {
    // 空 suffixes 数组表示匹配所有域名
    if (provider.suffixes.length === 0) {
      return provider;
    }

    const isMatch = provider.suffixes.some(suffix => {
      if (lowerDomain === suffix) return true;
      return lowerDomain.endsWith('.' + suffix);
    });

    if (isMatch) {
      return provider;
    }
  }

  return null;
}

/**
 * 查找第三方 RDAP 查询商
 */
export function findThirdPartyRdapProvider(domain: string): ThirdPartyProviderConfig | null {
  const lowerDomain = domain.toLowerCase();

  for (const provider of THIRD_PARTY_RDAP_PROVIDERS) {
    // 空 suffixes 数组表示匹配所有域名
    if (provider.suffixes.length === 0) {
      return provider;
    }

    const isMatch = provider.suffixes.some(suffix => {
      if (lowerDomain === suffix) return true;
      return lowerDomain.endsWith('.' + suffix);
    });

    if (isMatch) {
      return provider;
    }
  }

  return null;
}

/**
 * 添加第三方 WHOIS 查询商
 */
export function addThirdPartyWhoisProvider(config: ThirdPartyProviderConfig): void {
  const exists = THIRD_PARTY_WHOIS_PROVIDERS.some(p => p.name === config.name);
  if (exists) {
    console.warn(`[ThirdPartyProviders] WHOIS provider ${config.name} already exists, skipping`);
    return;
  }

  THIRD_PARTY_WHOIS_PROVIDERS.push(config);
  console.log(`[ThirdPartyProviders] Added WHOIS provider: ${config.name}`, {
    suffixes: config.suffixes,
  });
}

/**
 * 添加第三方 RDAP 查询商
 */
export function addThirdPartyRdapProvider(config: ThirdPartyProviderConfig): void {
  const exists = THIRD_PARTY_RDAP_PROVIDERS.some(p => p.name === config.name);
  if (exists) {
    console.warn(`[ThirdPartyProviders] RDAP provider ${config.name} already exists, skipping`);
    return;
  }

  THIRD_PARTY_RDAP_PROVIDERS.push(config);
  console.log(`[ThirdPartyProviders] Added RDAP provider: ${config.name}`, {
    suffixes: config.suffixes,
  });
}

/**
 * 移除第三方 WHOIS 查询商
 */
export function removeThirdPartyWhoisProvider(name: string): boolean {
  const index = THIRD_PARTY_WHOIS_PROVIDERS.findIndex(p => p.name === name);
  if (index === -1) return false;

  THIRD_PARTY_WHOIS_PROVIDERS.splice(index, 1);
  console.log(`[ThirdPartyProviders] Removed WHOIS provider: ${name}`);
  return true;
}

/**
 * 移除第三方 RDAP 查询商
 */
export function removeThirdPartyRdapProvider(name: string): boolean {
  const index = THIRD_PARTY_RDAP_PROVIDERS.findIndex(p => p.name === name);
  if (index === -1) return false;

  THIRD_PARTY_RDAP_PROVIDERS.splice(index, 1);
  console.log(`[ThirdPartyProviders] Removed RDAP provider: ${name}`);
  return true;
}
