/**
 * WHOIS 查询服务
 * 根据域名类型和提供商注册情况，智能选择查询策略
 */

import { whoisRegistry, WhoisResult, WhoisQueryStrategy } from './whoisScheduler';
import { DnsAccountOperations } from '../db/business-adapter';
import { log } from '../lib/logger';

/**
 * 判断是否为顶域（顶级域名）
 * @param domain 域名
 * @returns 是否为顶域
 */
function isTopLevelDomain(domain: string): boolean {
  const parts = domain.split('.');
  // 顶域通常只有两部分：example.com
  // 子域有三部分或更多：sub.example.com
  return parts.length === 2;
}

/**
 * 提取顶域
 * @param domain 域名（可能是子域）
 * @returns 顶域部分
 */
function extractTopLevelDomain(domain: string): string {
  const parts = domain.split('.');
  if (parts.length <= 2) {
    return domain;
  }
  // 取最后两部分作为顶域
  return parts.slice(-2).join('.');
}

/**
 * 获取域名对应的 DNS 账号配置
 * @param domain 域名
 * @returns DNS 账号配置列表
 */
async function getDnsAccountForDomain(domain: string): Promise<Array<{ type: string; config: any }>> {
  try {
    const accounts = await DnsAccountOperations.getAll() as any[];
    
    // 查找与该域名相关的账号
    // 这里简化处理，返回所有账号，实际可以根据域名匹配
    return accounts.map((acc: any) => ({
      type: acc.type,
      config: typeof acc.config === 'string' ? JSON.parse(acc.config) : acc.config,
    }));
  } catch (error) {
    log.error('WhoisService', 'Failed to get DNS accounts', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * 尝试通过 DNS 提供商查询 WHOIS
 * @param domain 域名
 * @returns WHOIS 结果或 null
 */
async function queryViaProvider(domain: string): Promise<WhoisResult | null> {
  const accounts = await getDnsAccountForDomain(domain);
  
  for (const account of accounts) {
    const scheduler = whoisRegistry.getScheduler(account.type);
    
    if (!scheduler) {
      log.debug('WhoisService', 'No WHOIS scheduler for provider type', {
        type: account.type,
        domain,
      });
      continue;
    }
    
    try {
      log.info('WhoisService', 'Querying WHOIS via provider', {
        type: account.type,
        domain,
      });
      
      const result = await scheduler.queryWhois(account.config, domain);
      
      if (result && result.success) {
        log.info('WhoisService', 'WHOIS query successful via provider', {
          type: account.type,
          domain,
        });
        return result;
      }
    } catch (error) {
      log.warn('WhoisService', 'Provider WHOIS query failed', {
        type: account.type,
        domain,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  return null;
}

/**
 * 通过内部 API 查询顶域 WHOIS
 * @param domain 顶域
 * @returns WHOIS 结果或 null
 */
async function queryTopLevelViaInternalApi(domain: string): Promise<WhoisResult | null> {
  try {
    // TODO: 调用内部 WHOIS API
    // 这里需要集成现有的 whoisJob 或相关服务
    log.info('WhoisService', 'Querying top-level domain via internal API', { domain });
    
    // 临时返回 null，等待内部 API 实现
    return null;
  } catch (error) {
    log.error('WhoisService', 'Internal API WHOIS query failed', {
      domain,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * 通过第三方服务查询 WHOIS
 * @param domain 域名
 * @returns WHOIS 结果或 null
 */
async function queryViaThirdParty(domain: string): Promise<WhoisResult | null> {
  try {
    // TODO: 调用第三方 WHOIS 服务
    // 例如：RDAP、WHOIS 服务器等
    log.info('WhoisService', 'Querying WHOIS via third-party service', { domain });
    
    // 临时返回 null，等待第三方服务实现
    return null;
  } catch (error) {
    log.error('WhoisService', 'Third-party WHOIS query failed', {
      domain,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * 并行查询子域和顶域的 WHOIS
 * @param subdomain 子域
 * @param topLevel 顶域
 * @returns 最先成功的 WHOIS 结果或 null
 */
async function querySubAndTopLevelParallel(
  subdomain: string,
  topLevel: string
): Promise<WhoisResult | null> {
  try {
    log.info('WhoisService', 'Querying subdomain and top-level in parallel', {
      subdomain,
      topLevel,
    });
    
    // 并行查询
    const [subResult, topResult] = await Promise.all([
      queryViaProvider(subdomain),
      queryTopLevelViaInternalApi(topLevel),
    ]);
    
    // 优先返回子域结果，如果失败则返回顶域结果
    if (subResult && subResult.success) {
      return subResult;
    }
    
    if (topResult && topResult.success) {
      return topResult;
    }
    
    return null;
  } catch (error) {
    log.error('WhoisService', 'Parallel WHOIS query failed', {
      subdomain,
      topLevel,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * 执行 WHOIS 查询
 * 根据域名类型选择不同的查询策略
 * 
 * @param domain 要查询的域名
 * @param strategy 查询策略（可选，默认自动判断）
 * @returns WHOIS 结果或 null
 */
export async function executeWhoisQuery(
  domain: string,
  strategy?: WhoisQueryStrategy
): Promise<WhoisResult | null> {
  const isTopLevel = isTopLevelDomain(domain);
  const selectedStrategy = strategy || (isTopLevel ? WhoisQueryStrategy.TOP_LEVEL : WhoisQueryStrategy.SUB_DOMAIN);
  
  log.info('WhoisService', 'Starting WHOIS query', {
    domain,
    isTopLevel,
    strategy: selectedStrategy,
  });
  
  if (selectedStrategy === WhoisQueryStrategy.TOP_LEVEL) {
    // 顶域查询策略：顶域 > DNS提供商 > 第三方查询
    
    // 1. 尝试内部 API 查询顶域
    let result = await queryTopLevelViaInternalApi(domain);
    if (result && result.success) {
      log.info('WhoisService', 'WHOIS query successful via internal API', { domain });
      return result;
    }
    
    // 2. 尝试 DNS 提供商查询
    result = await queryViaProvider(domain);
    if (result && result.success) {
      log.info('WhoisService', 'WHOIS query successful via provider', { domain });
      return result;
    }
    
    // 3. 尝试第三方查询
    result = await queryViaThirdParty(domain);
    if (result && result.success) {
      log.info('WhoisService', 'WHOIS query successful via third-party', { domain });
      return result;
    }
    
  } else {
    // 子域查询策略：DNS提供商 > 子域/顶域并行 > 第三方查询
    
    // 1. 尝试 DNS 提供商查询
    let result = await queryViaProvider(domain);
    if (result && result.success) {
      log.info('WhoisService', 'WHOIS query successful via provider', { domain });
      return result;
    }
    
    // 2. 并行查询子域和顶域
    const topLevel = extractTopLevelDomain(domain);
    result = await querySubAndTopLevelParallel(domain, topLevel);
    if (result && result.success) {
      log.info('WhoisService', 'WHOIS query successful via parallel query', { domain });
      return result;
    }
    
    // 3. 尝试第三方查询
    result = await queryViaThirdParty(domain);
    if (result && result.success) {
      log.info('WhoisService', 'WHOIS query successful via third-party', { domain });
      return result;
    }
  }
  
  log.warn('WhoisService', 'All WHOIS query methods failed', { domain });
  return null;
}
