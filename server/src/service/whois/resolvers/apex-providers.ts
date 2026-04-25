/**
 * 顶域查询商注册列表
 * 定义各种顶级域名的官方查询服务器
 */

import { QueryMethodType } from '../providers/base';
import { findRdapServer, getRdapServerList } from '../rdap-server-list';

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
 * IANA RDAP 服务器缓存
 */
let ianaRdapCache: Map<string, string> | null = null;
let ianaRdapCacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1小时内存缓存

/**
 * 加载 IANA RDAP 服务器到内存缓存
 */
async function loadIanaRdapCache(): Promise<Map<string, string>> {
  const now = Date.now();
  
  // 如果缓存有效，直接返回
  if (ianaRdapCache && (now - ianaRdapCacheTime) < CACHE_TTL) {
    return ianaRdapCache;
  }

  // 重新加载缓存
  const configs = await getRdapServerList();
  const cache = new Map<string, string>();
  
  for (const config of configs) {
    if (config.servers.length > 0) {
      cache.set(config.tld, config.servers[0]);
    }
  }
  
  ianaRdapCache = cache;
  ianaRdapCacheTime = now;
  
  console.log(`[ApexProviders] Loaded ${cache.size} RDAP servers from IANA cache`);
  return cache;
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
  {
    name: 'nic-today',
    suffixes: ['today'],
    method: QueryMethodType.WHOIS,
    server: 'whois.nic.today',
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
  {
    name: 'rdap-nic-today',
    suffixes: ['today'],
    method: QueryMethodType.RDAP,
    server: 'https://rdap.nic.today/',
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
 * 优先从 IANA 官方列表查找，未找到时回退到内置列表
 */
export async function findApexRdapProvider(domain: string): Promise<ProviderConfig | null> {
  const lowerDomain = domain.toLowerCase();
  
  // 首先尝试从 IANA 缓存查找
  try {
    const ianaCache = await loadIanaRdapCache();
    
    // 提取 TLD
    const parts = lowerDomain.split('.');
    const tld = parts[parts.length - 1];
    
    const ianaServer = ianaCache.get(tld);
    if (ianaServer) {
      return {
        name: `iana-rdap-${tld}`,
        suffixes: [tld],
        method: QueryMethodType.RDAP,
        server: ianaServer,
      };
    }
  } catch (error) {
    console.warn('[ApexProviders] Failed to load IANA RDAP cache', error);
  }
  
  // 回退到内置列表
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
 * 同步版本：根据域名查找匹配的 RDAP 查询商（仅使用内置列表）
 * @deprecated 请使用异步版本的 findApexRdapProvider
 */
export function findApexRdapProviderSync(domain: string): ProviderConfig | null {
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
  // 安全检查：不允许空 suffixes 数组（防止范用查询）
  if (!config.suffixes || config.suffixes.length === 0) {
    console.error(`[ApexProviders] SECURITY: Rejected WHOIS provider ${config.name} - empty suffixes array not allowed for apex providers`);
    return;
  }

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
  // 安全检查：不允许空 suffixes 数组（防止范用查询）
  if (!config.suffixes || config.suffixes.length === 0) {
    console.error(`[ApexProviders] SECURITY: Rejected RDAP provider ${config.name} - empty suffixes array not allowed for apex providers`);
    return;
  }

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
