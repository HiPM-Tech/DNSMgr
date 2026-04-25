/**
 * WHOIS Service 主入口
 * 
 * 架构：
 * - providers/     查询方式插件（WHOIS/RDAP）
 * - resolvers/     域名查询商注册列表
 *   - apex-providers.ts      顶域查询商列表（含第三方预留）
 *   - subdomain-providers.ts 子域查询商列表
 * 
 * 查询策略：
 * 1. 同层级查询并行竞速（WHOIS 和 RDAP 同时查询，取最快结果）
 * 2. 顶域查询（WHOIS + RDAP 并行）
 * 3. 子域查询（WHOIS + RDAP 并行，如果适用）
 * 4. 平级查询（子域名无提供商时，使用顶域查询商查询子域名）
 * 5. 第三方查询（WHOIS + RDAP 并行，最后备选）
 * 
 * 当子域名没有注册的提供商时，使用顶域的查询商进行平级查询
 */

// 导出查询方式
export {
  WhoisMethod,
  whoisMethod,
} from './providers/whois-method';

export {
  RdapMethod,
  rdapMethod,
} from './providers/rdap-method';

// 导出顶域查询商列表
export {
  APEX_WHOIS_PROVIDERS,
  APEX_RDAP_PROVIDERS,
  findApexWhoisProvider,
  findApexRdapProvider,
  addApexWhoisProvider,
  addApexRdapProvider,
  removeApexWhoisProvider,
  removeApexRdapProvider,
  type ProviderConfig,
} from './resolvers/apex-providers';

// 导出第三方查询服务器
export {
  THIRD_PARTY_WHOIS_PROVIDERS,
  THIRD_PARTY_RDAP_PROVIDERS,
  findThirdPartyWhoisProvider,
  findThirdPartyRdapProvider,
  addThirdPartyWhoisProvider,
  addThirdPartyRdapProvider,
  removeThirdPartyWhoisProvider,
  removeThirdPartyRdapProvider,
  type ThirdPartyProviderConfig,
} from './resolvers/third-party-providers';

// 导出子域查询商列表
export {
  SUBDOMAIN_WHOIS_PROVIDERS,
  SUBDOMAIN_RDAP_PROVIDERS,
  findSubdomainWhoisProvider,
  findSubdomainRdapProvider,
  isSubdomainHosted,
  addSubdomainWhoisProvider,
  addSubdomainRdapProvider,
  removeSubdomainWhoisProvider,
  removeSubdomainRdapProvider,
  type SubdomainProviderConfig,
} from './resolvers/subdomain-providers';

// 导出基础类型
export {
  QueryMethodType,
  type WhoisResult,
  type IQueryMethod,
  BaseQueryMethod,
} from './providers/base';

import { whoisMethod } from './providers/whois-method';
import { rdapMethod } from './providers/rdap-method';
import {
  findApexWhoisProvider,
  findApexRdapProvider,
} from './resolvers/apex-providers';
import {
  findThirdPartyWhoisProvider,
  findThirdPartyRdapProvider,
} from './resolvers/third-party-providers';
import {
  findSubdomainWhoisProvider,
  findSubdomainRdapProvider,
  isSubdomainHosted,
} from './resolvers/subdomain-providers';
import { WhoisResult } from './providers/base';
import { log } from '../../lib/logger';
import { getRootDomain } from './domain-utils';

/**
 * 查询选项
 */
export interface QueryOptions {
  /** 是否优先查询子域名 */
  preferSubdomain?: boolean;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否使用缓存 */
  useCache?: boolean;
}

/**
 * 缓存条目
 */
interface CacheEntry {
  result: WhoisResult;
  timestamp: number;
}

/**
 * WHOIS 服务
 */
class WhoisService {
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTtl = 6 * 60 * 60 * 1000; // 6 小时

  /**
   * 查询域名 WHOIS 信息
   * 
   * 查询策略（并行竞速）：
   * 1. 顶域查询（WHOIS + RDAP 并行）
   * 2. 子域查询（WHOIS + RDAP 并行，如果适用）
   * 3. 平级查询（子域名无提供商时，使用顶域查询商查询子域名）
   * 4. 第三方查询（WHOIS + RDAP 并行，最后备选）
   * 
   * 同层级的多个查询服务会同时发起，采用最快返回的结果
   */
  async query(domain: string, options: QueryOptions = {}): Promise<WhoisResult | null> {
    const { preferSubdomain = true, timeout = 30000 } = options;

    log.info('WhoisService', `Querying ${domain}`, { preferSubdomain });

    // 检查缓存
    const cached = this.getCached(domain);
    if (cached) {
      log.debug('WhoisService', `Cache hit for ${domain}`);
      return cached;
    }

    let result: WhoisResult | null = null;

    // 获取根域名
    const rootDomain = getRootDomain(domain);

    // 1. 顶域查询（WHOIS + RDAP 并行竞速）
    log.info('WhoisService', `Starting apex parallel race for ${rootDomain}`);
    result = await this.queryApexParallel(rootDomain, timeout);
    if (result?.expiryDate) {
      this.setCached(domain, result);
      return result;
    }

    // 2. 如果是子域名，尝试子域查询（WHOIS + RDAP 并行竞速）
    if (preferSubdomain && domain !== rootDomain) {
      log.info('WhoisService', `Starting subdomain parallel race for ${domain}`);
      result = await this.querySubdomainParallel(domain, timeout);
      if (result?.expiryDate) {
        this.setCached(domain, result);
        return result;
      }

      // 3. 子域名没有注册提供商时，使用顶域查询商进行平级查询（并行）
      if (!isSubdomainHosted(domain)) {
        log.info('WhoisService', `No subdomain provider for ${domain}, trying apex providers directly (parallel)`);
        result = await this.queryApexParallel(domain, timeout);
        if (result?.expiryDate) {
          this.setCached(domain, result);
          return result;
        }
      }
    }

    // 4. 尝试第三方查询服务器（WHOIS + RDAP 并行竞速，最后备选）
    log.info('WhoisService', `Starting third-party parallel race for ${domain}`);
    result = await this.queryThirdPartyParallel(domain, timeout);
    if (result?.expiryDate) {
      this.setCached(domain, result);
      return result;
    }

    log.warn('WhoisService', `All queries failed for ${domain}`);
    return null;
  }

  /**
   * 并行竞速查询 - 返回最快成功的结果
   * @param queries 查询函数数组
   * @param timeout 超时时间
   * @param raceName 竞速名称（用于日志）
   */
  private async raceQueries(
    queries: Array<() => Promise<WhoisResult | null>>,
    timeout: number,
    raceName: string
  ): Promise<WhoisResult | null> {
    if (queries.length === 0) return null;
    if (queries.length === 1) return queries[0]();

    const startTime = Date.now();
    log.info('WhoisService', `Starting ${raceName} with ${queries.length} queries`);

    // 创建带超时的 Promise
    const timeoutPromise = new Promise<WhoisResult | null>((resolve) => {
      setTimeout(() => {
        log.debug('WhoisService', `${raceName} timeout after ${timeout}ms`);
        resolve(null);
      }, timeout);
    });

    // 包装查询函数，添加日志和错误处理
    const wrapQuery = (
      query: () => Promise<WhoisResult | null>,
      index: number
    ): Promise<WhoisResult | null> =>
      query().then((result) => {
        if (result?.expiryDate) {
          const elapsed = Date.now() - startTime;
          log.info('WhoisService', `${raceName} query ${index + 1} won in ${elapsed}ms`);
          return result;
        }
        return null;
      }).catch((error) => {
        log.warn('WhoisService', `${raceName} query ${index + 1} failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });

    // 包装所有查询
    const wrappedQueries = queries.map((q, i) => wrapQuery(q, i));

    // 使用 Promise.race 竞速，持续获取结果直到有成功的或全部失败
    const allPromises = [...wrappedQueries, timeoutPromise];
    const completedIndices = new Set<number>();

    while (completedIndices.size < wrappedQueries.length) {
      // 只竞速未完成的查询
      const activePromises = wrappedQueries
        .map((p, i) => ({ promise: p, index: i }))
        .filter(({ index }) => !completedIndices.has(index))
        .map(({ promise }) => promise);

      if (activePromises.length === 0) break;

      // 添加超时 Promise
      const racePromises = [...activePromises, timeoutPromise];

      const winner = await Promise.race(racePromises);

      // 检查是否是超时
      if (winner === null && completedIndices.size < wrappedQueries.length) {
        // 超时，标记所有剩余查询为完成
        log.warn('WhoisService', `${raceName} timeout, ${activePromises.length} queries still pending`);
        break;
      }

      // 如果有成功结果，返回
      if (winner?.expiryDate) {
        return winner;
      }

      // 标记完成的查询（需要找到是哪个完成了）
      // 由于 Promise.race 不告诉我们哪个赢了，我们需要检查所有活跃的 Promise
      const results = await Promise.all(
        activePromises.map((p, idx) =>
          p.then((r) => ({ result: r, index: wrappedQueries.findIndex((_, i) => !completedIndices.has(i) && i >= idx) }))
        )
      );

      for (const { result, index } of results) {
        if (index >= 0 && !completedIndices.has(index)) {
          completedIndices.add(index);
          if (result?.expiryDate) {
            return result;
          }
        }
      }
    }

    log.warn('WhoisService', `${raceName} all queries failed or timed out`);
    return null;
  }

  /**
   * 并行查询顶域（WHOIS + RDAP 竞速）
   */
  private async queryApexParallel(domain: string, timeout: number): Promise<WhoisResult | null> {
    const queries: Array<() => Promise<WhoisResult | null>> = [];

    const whoisProvider = findApexWhoisProvider(domain);
    const rdapProvider = findApexRdapProvider(domain);

    if (whoisProvider) {
      queries.push(() => this.queryWithProvider(domain, whoisProvider, whoisMethod, 'WHOIS'));
    }

    if (rdapProvider) {
      queries.push(() => this.queryWithProvider(domain, rdapProvider, rdapMethod, 'RDAP'));
    }

    return this.raceQueries(queries, timeout, `Apex race for ${domain}`);
  }

  /**
   * 并行查询子域（WHOIS + RDAP 竞速）
   */
  private async querySubdomainParallel(domain: string, timeout: number): Promise<WhoisResult | null> {
    const queries: Array<() => Promise<WhoisResult | null>> = [];

    const whoisProvider = findSubdomainWhoisProvider(domain);
    const rdapProvider = findSubdomainRdapProvider(domain);

    if (whoisProvider) {
      queries.push(() => this.queryWithProvider(domain, whoisProvider, whoisMethod, 'Subdomain WHOIS'));
    }

    if (rdapProvider) {
      queries.push(() => this.queryWithProvider(domain, rdapProvider, rdapMethod, 'Subdomain RDAP'));
    }

    return this.raceQueries(queries, timeout, `Subdomain race for ${domain}`);
  }

  /**
   * 并行查询第三方（WHOIS + RDAP 竞速）
   */
  private async queryThirdPartyParallel(domain: string, timeout: number): Promise<WhoisResult | null> {
    const queries: Array<() => Promise<WhoisResult | null>> = [];

    const whoisProvider = findThirdPartyWhoisProvider(domain);
    const rdapProvider = findThirdPartyRdapProvider(domain);

    if (whoisProvider) {
      queries.push(() => this.queryWithProvider(domain, whoisProvider, whoisMethod, 'Third-party WHOIS'));
    }

    if (rdapProvider) {
      queries.push(() => this.queryWithProvider(domain, rdapProvider, rdapMethod, 'Third-party RDAP'));
    }

    return this.raceQueries(queries, timeout, `Third-party race for ${domain}`);
  }

  /**
   * 使用指定提供商和查询方法查询
   */
  private async queryWithProvider(
    domain: string,
    provider: { name: string; server: string },
    method: { query: (domain: string, server: string) => Promise<WhoisResult | null> },
    methodName: string
  ): Promise<WhoisResult | null> {
    try {
      log.info('WhoisService', `Querying ${domain} via ${methodName} ${provider.name}`);
      const result = await method.query(domain, provider.server);
      if (result?.expiryDate) {
        log.info('WhoisService', `${methodName} ${provider.name} succeeded for ${domain}`);
        return result;
      }
    } catch (error) {
      log.warn('WhoisService', `${methodName} ${provider.name} failed for ${domain}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }

  /**
   * 获取缓存
   */
  private getCached(domain: string): WhoisResult | null {
    const cached = this.cache.get(domain);
    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      return cached.result;
    }
    return null;
  }

  /**
   * 设置缓存
   */
  private setCached(domain: string, result: WhoisResult): void {
    this.cache.set(domain, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * 清除缓存
   */
  clearCache(domain?: string): void {
    if (domain) {
      this.cache.delete(domain);
    } else {
      this.cache.clear();
    }
  }

}

// 导出单例
export const whoisService = new WhoisService();

// 为了向后兼容，导出 queryWhois 函数
export async function queryWhois(domain: string): Promise<WhoisResult | null> {
  return whoisService.query(domain);
}

// 从 domain-utils 导出 getRootDomain 函数（保持向后兼容）
export { getRootDomain } from './domain-utils';
