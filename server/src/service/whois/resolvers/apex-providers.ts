/**
 * 顶域查询商注册列表
 * 定义各种顶级域名的官方查询服务器
 */

import { QueryMethodType } from '../providers/base';

/**
 * 查询商配置
 */
export interface ProviderConfig {
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
 * 顶域 WHOIS 查询商列表
 */
export const APEX_WHOIS_PROVIDERS: ProviderConfig[] = [
  {
    name: 'verisign-com-net',
    suffixes: ['com', 'net'],
    method: QueryMethodType.WHOIS,
    server: 'whois.verisign-grs.com',
  },
  {
    name: 'pir-org-info',
    suffixes: ['org', 'info'],
    method: QueryMethodType.WHOIS,
    server: 'whois.publicinterestregistry.org',
  },
  {
    name: 'afilias-biz',
    suffixes: ['biz'],
    method: QueryMethodType.WHOIS,
    server: 'whois.biz',
  },
  {
    name: 'nic-us',
    suffixes: ['us'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.us',
  },
  {
    name: 'nic-io',
    suffixes: ['io'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.io',
  },
  {
    name: 'nic-co',
    suffixes: ['co'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.co',
  },
  {
    name: 'nic-tv',
    suffixes: ['tv'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.tv',
  },
  {
    name: 'nic-cc',
    suffixes: ['cc'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.cc',
  },
  {
    name: 'nic-me',
    suffixes: ['me'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.me',
  },
  {
    name: 'google-app-dev-page',
    suffixes: ['app', 'dev', 'page'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.google',
  },
  {
    name: 'nic-cloud',
    suffixes: ['cloud'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.cloud',
  },
  {
    name: 'nic-ai',
    suffixes: ['ai'],
    method: QueryMethodType.WHOIS,
    server: 'whois.whois.ai',
  },
  // 国别域名
  {
    name: 'cnnic-cn',
    suffixes: ['cn'],
    method: QueryMethodType.WHOIS,
    server: 'whois.cnnic.cn',
  },
  {
    name: 'nominet-uk',
    suffixes: ['uk', 'co.uk', 'org.uk', 'net.uk'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.uk',
  },
  {
    name: 'denic-de',
    suffixes: ['de'],
    method: QueryMethodType.WHOIS,
    server: 'whois.denic.de',
  },
  {
    name: 'afnic-fr',
    suffixes: ['fr'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.fr',
  },
  {
    name: 'eurid-eu',
    suffixes: ['eu'],
    method: QueryMethodType.WHOIS,
    server: 'whois.eu',
  },
  {
    name: 'sidn-nl',
    suffixes: ['nl'],
    method: QueryMethodType.WHOIS,
    server: 'whois.sidn.nl',
  },
  {
    name: 'tcinet-ru',
    suffixes: ['ru', 'su'],
    method: QueryMethodType.WHOIS,
    server: 'whois.tcinet.ru',
  },
  {
    name: 'registro-br',
    suffixes: ['br'],
    method: QueryMethodType.WHOIS,
    server: 'whois.registro.br',
  },
  {
    name: 'auda-au',
    suffixes: ['au', 'com.au', 'net.au', 'org.au'],
    method: QueryMethodType.WHOIS,
    server: 'whois.auda.org.au',
  },
  {
    name: 'jprs-jp',
    suffixes: ['jp', 'co.jp', 'ne.jp'],
    method: QueryMethodType.WHOIS,
    server: 'whois.jprs.jp',
  },
  {
    name: 'kisa-kr',
    suffixes: ['kr', 'co.kr'],
    method: QueryMethodType.WHOIS,
    server: 'whois.kr',
  },
  {
    name: 'twnic-tw',
    suffixes: ['tw', 'com.tw', 'net.tw'],
    method: QueryMethodType.WHOIS,
    server: 'whois.twnic.net.tw',
  },
  {
    name: 'hkirc-hk',
    suffixes: ['hk', 'com.hk'],
    method: QueryMethodType.WHOIS,
    server: 'whois.hkirc.hk',
  },
  {
    name: 'sgnic-sg',
    suffixes: ['sg', 'com.sg'],
    method: QueryMethodType.WHOIS,
    server: 'whois.sgnic.sg',
  },
  // 新顶级域名
  {
    name: 'nic-xyz',
    suffixes: ['xyz'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.xyz',
  },
  {
    name: 'nic-club',
    suffixes: ['club'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.club',
  },
  {
    name: 'nic-top',
    suffixes: ['top'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.top',
  },
  {
    name: 'nic-vip',
    suffixes: ['vip'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.vip',
  },
  {
    name: 'nic-site',
    suffixes: ['site'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.site',
  },
  {
    name: 'nic-online',
    suffixes: ['online'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.online',
  },
  {
    name: 'nic-store',
    suffixes: ['store'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.store',
  },
  {
    name: 'nic-work',
    suffixes: ['work'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.work',
  },
];

/**
 * 顶域 RDAP 查询商列表
 */
export const APEX_RDAP_PROVIDERS: ProviderConfig[] = [
  {
    name: 'rdap-verisign',
    suffixes: ['com', 'net'],
    method: QueryMethodType.RDAP,
    server: 'https://rdap.verisign-grs.com/',
  },
  {
    name: 'rdap-pir',
    suffixes: ['org', 'info'],
    method: QueryMethodType.RDAP,
    server: 'https://rdap.publicinterestregistry.org/rdap/',
  },
  {
    name: 'rdap-google',
    suffixes: ['app', 'dev', 'page'],
    method: QueryMethodType.RDAP,
    server: 'https://rdap.nic.google/',
  },
  {
    name: 'rdap-nic-io',
    suffixes: ['io'],
    method: QueryMethodType.RDAP,
    server: 'https://rdap.nic.io/',
  },
  {
    name: 'rdap-nic-cloud',
    suffixes: ['cloud'],
    method: QueryMethodType.RDAP,
    server: 'https://rdap.nic.cloud/',
  },
  {
    name: 'rdap-nic-uk',
    suffixes: ['uk'],
    method: QueryMethodType.RDAP,
    server: 'https://rdap.nic.uk/',
  },
];

/**
 * 根据域名查找匹配的 WHOIS 查询商
 */
export function findApexWhoisProvider(domain: string): ProviderConfig | null {
  const lowerDomain = domain.toLowerCase();

  for (const provider of APEX_WHOIS_PROVIDERS) {
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
 * 根据域名查找匹配的 RDAP 查询商
 */
export function findApexRdapProvider(domain: string): ProviderConfig | null {
  const lowerDomain = domain.toLowerCase();

  for (const provider of APEX_RDAP_PROVIDERS) {
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
 * 添加自定义顶域 WHOIS 查询商
 */
export function addApexWhoisProvider(config: ProviderConfig): void {
  const exists = APEX_WHOIS_PROVIDERS.some(p => p.name === config.name);
  if (exists) {
    console.warn(`[ApexProviders] WHOIS provider ${config.name} already exists, skipping`);
    return;
  }

  APEX_WHOIS_PROVIDERS.push(config);
  console.log(`[ApexProviders] Added WHOIS provider: ${config.name}`, {
    suffixes: config.suffixes,
  });
}

/**
 * 添加自定义顶域 RDAP 查询商
 */
export function addApexRdapProvider(config: ProviderConfig): void {
  const exists = APEX_RDAP_PROVIDERS.some(p => p.name === config.name);
  if (exists) {
    console.warn(`[ApexProviders] RDAP provider ${config.name} already exists, skipping`);
    return;
  }

  APEX_RDAP_PROVIDERS.push(config);
  console.log(`[ApexProviders] Added RDAP provider: ${config.name}`, {
    suffixes: config.suffixes,
  });
}

/**
 * 移除顶域 WHOIS 查询商
 */
export function removeApexWhoisProvider(name: string): boolean {
  const index = APEX_WHOIS_PROVIDERS.findIndex(p => p.name === name);
  if (index === -1) return false;

  APEX_WHOIS_PROVIDERS.splice(index, 1);
  console.log(`[ApexProviders] Removed WHOIS provider: ${name}`);
  return true;
}

/**
 * 移除顶域 RDAP 查询商
 */
export function removeApexRdapProvider(name: string): boolean {
  const index = APEX_RDAP_PROVIDERS.findIndex(p => p.name === name);
  if (index === -1) return false;

  APEX_RDAP_PROVIDERS.splice(index, 1);
  console.log(`[ApexProviders] Removed RDAP provider: ${name}`);
  return true;
}
