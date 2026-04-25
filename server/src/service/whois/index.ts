/**
 * WHOIS Service 主入口
 *
 * 架构：
 * - providers/     查询方式插件（WHOIS/RDAP）
 * - resolvers/     域名查询商注册列表
 *   - apex-providers.ts      顶域查询商列表（含第三方预留）
 *   - subdomain-providers.ts 子域查询商列表
 *
 * 查询策略（分层并行竞速）：
 * 1. 顶域查询
 *    1.1 顶域RDAP 并行查询（所有匹配的RDAP提供商竞速）
 *    1.2 顶域WHOIS 并行查询（所有匹配的WHOIS提供商竞速）
 * 2. 子域查询（如果适用）
 *    2.1 子域RDAP 并行查询（所有匹配的子域RDAP提供商竞速）
 *    2.2 子域WHOIS 并行查询（所有匹配的子域WHOIS提供商竞速）
 *    2.3 子域RDAP 并行平级查询（使用子域RDAP提供商无视域名后缀匹配进行查询）
 *    2.4 子域WHOIS 并行平级查询（使用子域WHOIS提供商无视域名后缀匹配进行查询）
 * 3. 第三方查询（最后备选）
 *    3.1 第三方RDAP 并行查询
 *    3.2 第三方WHOIS 并行查询
 *
 * 注意：顶域/子域查询不允许注册泛用查询提供商
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
  APEX_WHOIS_PROVIDERS,
  APEX_RDAP_PROVIDERS,
  findApexWhoisProvider,
  findApexRdapProvider,
  type ProviderConfig,
} from './resolvers/apex-providers';
import {
  THIRD_PARTY_WHOIS_PROVIDERS,
  THIRD_PARTY_RDAP_PROVIDERS,
  findThirdPartyWhoisProvider,
  findThirdPartyRdapProvider,
} from './resolvers/third-party-providers';
import {
  SUBDOMAIN_WHOIS_PROVIDERS,
  SUBDOMAIN_RDAP_PROVIDERS,
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
 * 查询上下文信息（用于日志）
 */
interface QueryContext {
  level: 'apex' | 'subdomain' | 'third-party';
  method: 'WHOIS' | 'RDAP';
  providerName: string;
  isUplevel?: boolean;
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
   * 查询策略（分层并行竞速）：
   * 1. 顶域RDAP 并行查询
   * 2. 顶域WHOIS 并行查询
   * 3. 子域RDAP 并行查询（如果适用）
   * 4. 子域WHOIS 并行查询（如果适用）
   * 5. 子域RDAP 并行平级查询（试图查询其它子域提供商）
   * 6. 子域WHOIS 并行平级查询（试图查询其它子域提供商）
   * 7. 第三方RDAP 并行查询
   * 8. 第三方WHOIS 并行查询
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

    // 获取根域名
    const rootDomain = getRootDomain(domain);
    const isSubdomain = domain !== rootDomain;

    // 如果是顶域，直接查询顶域
    if (!isSubdomain) {
      return this.queryApexOnly(domain, timeout);
    }

    // ========== 子域名：顶域和子域并行查询 ==========
    log.info('WhoisService', `[PARALLEL] Starting parallel apex and subdomain queries for ${domain}`);

    // 并行启动顶域查询和子域查询
    const apexPromise = this.queryApexCombined(rootDomain, timeout);
    const subdomainPromise = preferSubdomain
      ? this.querySubdomainCombined(domain, timeout)
      : Promise.resolve(null);

    // 等待两个查询完成
    const [apexResult, subdomainResult] = await Promise.all([apexPromise, subdomainPromise]);

    // 如果子域查询成功，返回子域结果（包含顶域到期时间）
    if (subdomainResult?.expiryDate) {
      if (apexResult?.expiryDate) {
        subdomainResult.apexExpiryDate = apexResult.expiryDate;
        subdomainResult.apexRegistrar = apexResult.registrar;
      }
      this.setCached(domain, subdomainResult);
      log.info('WhoisService', `[SUCCESS] Subdomain query succeeded for ${domain}`);
      return subdomainResult;
    }

    // 如果子域查询失败但顶域查询成功，返回顶域结果
    if (apexResult?.expiryDate) {
      const result: WhoisResult = {
        domain,
        expiryDate: apexResult.expiryDate,
        registrar: apexResult.registrar,
        nameServers: apexResult.nameServers,
        raw: apexResult.raw,
        apexExpiryDate: apexResult.expiryDate,
        apexRegistrar: apexResult.registrar,
      };
      this.setCached(domain, result);
      log.info('WhoisService', `[FALLBACK] Using apex domain expiry for ${domain}`);
      return result;
    }

    // ========== 3. 第三方查询（最后备选） ==========
    log.info('WhoisService', `[THIRDPARTY] Starting third-party queries for ${domain}`);

    let result = await this.queryThirdPartyRdapParallel(domain, timeout);
    if (!result?.expiryDate) {
      result = await this.queryThirdPartyWhoisParallel(domain, timeout);
    }

    if (result?.expiryDate) {
      this.setCached(domain, result);
      log.info('WhoisService', `[SUCCESS] Third-party query succeeded for ${domain}`);
      return result;
    }

    log.warn('WhoisService', `[FAILED] All queries failed for ${domain}`);
    return null;
  }

  /**
   * 仅查询顶域（用于顶域名本身）
   */
  private async queryApexOnly(domain: string, timeout: number): Promise<WhoisResult | null> {
    log.info('WhoisService', `[APEX-ONLY] Querying apex domain ${domain}`);

    let result = await this.queryApexRdapParallel(domain, timeout);
    if (!result?.expiryDate) {
      result = await this.queryApexWhoisParallel(domain, timeout);
    }

    if (result?.expiryDate) {
      this.setCached(domain, result);
      log.info('WhoisService', `[SUCCESS] Apex query succeeded for ${domain}`);
      return result;
    }

    // 尝试第三方
    result = await this.queryThirdPartyRdapParallel(domain, timeout);
    if (!result?.expiryDate) {
      result = await this.queryThirdPartyWhoisParallel(domain, timeout);
    }

    if (result?.expiryDate) {
      this.setCached(domain, result);
      return result;
    }

    return null;
  }

  /**
   * 组合查询顶域（RDAP + WHOIS）
   */
  private async queryApexCombined(domain: string, timeout: number): Promise<WhoisResult | null> {
    log.info('WhoisService', `[APEX-COMBINED] Starting combined apex queries for ${domain}`);

    // 并行查询 RDAP 和 WHOIS
    const rdapPromise = this.queryApexRdapParallel(domain, timeout);
    const whoisPromise = this.queryApexWhoisParallel(domain, timeout);

    // 使用 Promise.race 获取最快的结果
    const rdapResult = await rdapPromise;
    if (rdapResult?.expiryDate) {
      log.info('WhoisService', `[APEX-COMBINED] RDAP won for ${domain}`);
      return rdapResult;
    }

    const whoisResult = await whoisPromise;
    if (whoisResult?.expiryDate) {
      log.info('WhoisService', `[APEX-COMBINED] WHOIS won for ${domain}`);
      return whoisResult;
    }

    return null;
  }

  /**
   * 组合查询子域（所有子域查询方式）
   */
  private async querySubdomainCombined(domain: string, timeout: number): Promise<WhoisResult | null> {
    log.info('WhoisService', `[SUBDOMAIN-COMBINED] Starting combined subdomain queries for ${domain}`);

    // 并行启动所有子域查询
    const promises = [
      this.querySubdomainRdapParallel(domain, timeout),
      this.querySubdomainWhoisParallel(domain, timeout),
      this.queryUplevelRdapParallel(domain, timeout),
      this.queryUplevelWhoisParallel(domain, timeout),
    ];

    // 等待所有查询完成，取第一个成功的结果
    const results = await Promise.all(promises);

    for (let i = 0; i < results.length; i++) {
      if (results[i]?.expiryDate) {
        const methods = ['Subdomain-RDAP', 'Subdomain-WHOIS', 'Uplevel-RDAP', 'Uplevel-WHOIS'];
        log.info('WhoisService', `[SUBDOMAIN-COMBINED] ${methods[i]} won for ${domain}`);
        return results[i];
      }
    }

    return null;
  }

  /**
   * 并行竞速查询 - 返回最快成功的结果
   * @param queries 查询函数数组，每个函数返回 Promise<WhoisResult | null>
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
    log.info('WhoisService', `${raceName} Starting race with ${queries.length} queries`);

    // 创建带超时的 Promise
    const timeoutPromise = new Promise<WhoisResult | null>((resolve) => {
      setTimeout(() => {
        log.debug('WhoisService', `${raceName} Timeout after ${timeout}ms`);
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
          log.info('WhoisService', `${raceName} Query ${index + 1} won in ${elapsed}ms`);
          return result;
        }
        return null;
      }).catch((error) => {
        log.warn('WhoisService', `${raceName} Query ${index + 1} failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });

    // 包装所有查询
    const wrappedQueries = queries.map((q, i) => wrapQuery(q, i));

    // 竞速：使用 Promise.race 持续获取结果
    const pendingQueries = [...wrappedQueries];
    let winner: WhoisResult | null = null;

    while (pendingQueries.length > 0) {
      // 与超时 Promise 竞速
      winner = await Promise.race([...pendingQueries, timeoutPromise]);

      // 检查是否超时
      if (winner === null) {
        log.warn('WhoisService', `${raceName} Timeout, ${pendingQueries.length} queries still pending`);
        break;
      }

      // 如果有成功结果，返回
      if (winner?.expiryDate) {
        return winner;
      }

      // 移除已完成的查询（返回 null 或失败的）
      // 由于不知道哪个完成了，需要检查所有
      const results = await Promise.all(
        pendingQueries.map(p => p.then(r => ({ promise: p, result: r })))
      );

      pendingQueries.length = 0;
      for (const { promise, result } of results) {
        if (result === null || !result.expiryDate) {
          // 这个查询完成了但没有成功结果，不移回 pending
        } else {
          // 还没完成，保留
          pendingQueries.push(promise);
        }
      }
    }

    log.warn('WhoisService', `${raceName} All queries failed or timed out`);
    return null;
  }

  /**
   * 使用指定提供商和查询方法查询
   */
  private async queryWithProvider(
    domain: string,
    provider: ProviderConfig,
    method: { query: (domain: string, server: string) => Promise<WhoisResult | null> },
    context: QueryContext
  ): Promise<WhoisResult | null> {
    const uplevelTag = context.isUplevel ? '+UPLEVEL' : '';
    const logPrefix = `[${context.level}+${context.method}${uplevelTag}+${provider.name}]`;

    try {
      log.info('WhoisService', `${logPrefix} Querying ${domain} via ${provider.server}`);
      const result = await method.query(domain, provider.server);
      if (result?.expiryDate) {
        log.info('WhoisService', `${logPrefix} Success for ${domain}, expiry: ${result.expiryDate}`);
        return result;
      }
    } catch (error) {
      log.warn('WhoisService', `${logPrefix} Failed for ${domain}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }

  // ========== 顶域查询 ==========

  /**
   * 顶域RDAP 并行查询
   * 所有匹配的RDAP提供商同时查询，取最快结果
   */
  private async queryApexRdapParallel(domain: string, timeout: number): Promise<WhoisResult | null> {
    const queries: Array<() => Promise<WhoisResult | null>> = [];

    // 查找所有匹配的RDAP提供商
    for (const provider of APEX_RDAP_PROVIDERS) {
      const isMatch = provider.suffixes.some(suffix => {
        if (domain.toLowerCase() === suffix) return true;
        return domain.toLowerCase().endsWith('.' + suffix);
      });

      if (isMatch) {
        queries.push(() => this.queryWithProvider(
          domain,
          provider,
          rdapMethod,
          { level: 'apex', method: 'RDAP', providerName: provider.name }
        ));
      }
    }

    if (queries.length === 0) {
      log.debug('WhoisService', `[APEX+RDAP] No matching providers for ${domain}`);
      return null;
    }

    return this.raceQueries(queries, timeout, `[APEX+RDAP+PARALLEL]`);
  }

  /**
   * 顶域WHOIS 并行查询
   * 所有匹配的WHOIS提供商同时查询，取最快结果
   */
  private async queryApexWhoisParallel(domain: string, timeout: number): Promise<WhoisResult | null> {
    const queries: Array<() => Promise<WhoisResult | null>> = [];

    // 查找所有匹配的WHOIS提供商
    for (const provider of APEX_WHOIS_PROVIDERS) {
      const isMatch = provider.suffixes.some(suffix => {
        if (domain.toLowerCase() === suffix) return true;
        return domain.toLowerCase().endsWith('.' + suffix);
      });

      if (isMatch) {
        queries.push(() => this.queryWithProvider(
          domain,
          provider,
          whoisMethod,
          { level: 'apex', method: 'WHOIS', providerName: provider.name }
        ));
      }
    }

    if (queries.length === 0) {
      log.debug('WhoisService', `[APEX+WHOIS] No matching providers for ${domain}`);
      return null;
    }

    return this.raceQueries(queries, timeout, `[APEX+WHOIS+PARALLEL]`);
  }

  // ========== 子域查询 ==========

  /**
   * 子域RDAP 并行查询（注册的提供商）
   */
  private async querySubdomainRdapParallel(domain: string, timeout: number): Promise<WhoisResult | null> {
    const queries: Array<() => Promise<WhoisResult | null>> = [];

    // 查找所有匹配的子域RDAP提供商
    for (const provider of SUBDOMAIN_RDAP_PROVIDERS) {
      const isMatch = provider.suffixes.some(suffix => {
        if (domain.toLowerCase() === suffix) return true;
        return domain.toLowerCase().endsWith('.' + suffix);
      });

      if (isMatch) {
        queries.push(() => this.queryWithProvider(
          domain,
          provider,
          rdapMethod,
          { level: 'subdomain', method: 'RDAP', providerName: provider.name }
        ));
      }
    }

    if (queries.length === 0) {
      log.debug('WhoisService', `[SUBDOMAIN+RDAP] No matching registered providers for ${domain}`);
      return null;
    }

    return this.raceQueries(queries, timeout, `[SUBDOMAIN+RDAP+PARALLEL]`);
  }

  /**
   * 子域WHOIS 并行查询（注册的提供商）
   */
  private async querySubdomainWhoisParallel(domain: string, timeout: number): Promise<WhoisResult | null> {
    const queries: Array<() => Promise<WhoisResult | null>> = [];

    // 查找所有匹配的子域WHOIS提供商
    for (const provider of SUBDOMAIN_WHOIS_PROVIDERS) {
      const isMatch = provider.suffixes.some(suffix => {
        if (domain.toLowerCase() === suffix) return true;
        return domain.toLowerCase().endsWith('.' + suffix);
      });

      if (isMatch) {
        queries.push(() => this.queryWithProvider(
          domain,
          provider,
          whoisMethod,
          { level: 'subdomain', method: 'WHOIS', providerName: provider.name }
        ));
      }
    }

    if (queries.length === 0) {
      log.debug('WhoisService', `[SUBDOMAIN+WHOIS] No matching registered providers for ${domain}`);
      return null;
    }

    return this.raceQueries(queries, timeout, `[SUBDOMAIN+WHOIS+PARALLEL]`);
  }

  // ========== 平级查询 ==========

  /**
   * 子域RDAP 并行平级查询
   * 使用子域RDAP提供商无视域名后缀匹配进行查询
   */
  private async queryUplevelRdapParallel(domain: string, timeout: number): Promise<WhoisResult | null> {
    const queries: Array<() => Promise<WhoisResult | null>> = [];

    // 使用子域RDAP提供商无视域名后缀匹配进行查询
    for (const provider of SUBDOMAIN_RDAP_PROVIDERS) {
      queries.push(() => this.queryWithProvider(
        domain,
        provider,
        rdapMethod,
        { level: 'subdomain', method: 'RDAP', providerName: provider.name, isUplevel: true }
      ));
    }

    if (queries.length === 0) {
      log.debug('WhoisService', `[SUBDOMAIN+RDAP+UPLEVEL] No subdomain RDAP providers available for ${domain}`);
      return null;
    }

    return this.raceQueries(queries, timeout, `[SUBDOMAIN+RDAP+UPLEVEL]`);
  }

  /**
   * 子域WHOIS 并行平级查询
   * 使用子域WHOIS提供商无视域名后缀匹配进行查询
   */
  private async queryUplevelWhoisParallel(domain: string, timeout: number): Promise<WhoisResult | null> {
    const queries: Array<() => Promise<WhoisResult | null>> = [];

    // 使用子域WHOIS提供商无视域名后缀匹配进行查询
    for (const provider of SUBDOMAIN_WHOIS_PROVIDERS) {
      queries.push(() => this.queryWithProvider(
        domain,
        provider,
        whoisMethod,
        { level: 'subdomain', method: 'WHOIS', providerName: provider.name, isUplevel: true }
      ));
    }

    if (queries.length === 0) {
      log.debug('WhoisService', `[SUBDOMAIN+WHOIS+UPLEVEL] No subdomain WHOIS providers available for ${domain}`);
      return null;
    }

    return this.raceQueries(queries, timeout, `[SUBDOMAIN+WHOIS+UPLEVEL]`);
  }

  // ========== 第三方查询 ==========

  /**
   * 第三方RDAP 并行查询
   */
  private async queryThirdPartyRdapParallel(domain: string, timeout: number): Promise<WhoisResult | null> {
    const queries: Array<() => Promise<WhoisResult | null>> = [];

    // 查找所有匹配的第三方RDAP提供商
    for (const provider of THIRD_PARTY_RDAP_PROVIDERS) {
      const isMatch = provider.suffixes.length === 0 || provider.suffixes.some(suffix => {
        if (domain.toLowerCase() === suffix) return true;
        return domain.toLowerCase().endsWith('.' + suffix);
      });

      if (isMatch) {
        queries.push(() => this.queryWithProvider(
          domain,
          provider,
          rdapMethod,
          { level: 'third-party', method: 'RDAP', providerName: provider.name }
        ));
      }
    }

    if (queries.length === 0) {
      log.debug('WhoisService', `[第三方+RDAP] No matching providers for ${domain}`);
      return null;
    }

    return this.raceQueries(queries, timeout, `[第三方+RDAP+并行]`);
  }

  /**
   * 第三方WHOIS 并行查询
   */
  private async queryThirdPartyWhoisParallel(domain: string, timeout: number): Promise<WhoisResult | null> {
    const queries: Array<() => Promise<WhoisResult | null>> = [];

    // 查找所有匹配的第三方WHOIS提供商
    for (const provider of THIRD_PARTY_WHOIS_PROVIDERS) {
      const isMatch = provider.suffixes.length === 0 || provider.suffixes.some(suffix => {
        if (domain.toLowerCase() === suffix) return true;
        return domain.toLowerCase().endsWith('.' + suffix);
      });

      if (isMatch) {
        queries.push(() => this.queryWithProvider(
          domain,
          provider,
          whoisMethod,
          { level: 'third-party', method: 'WHOIS', providerName: provider.name }
        ));
      }
    }

    if (queries.length === 0) {
      log.debug('WhoisService', `[THIRDPARTY+WHOIS] No matching providers for ${domain}`);
      return null;
    }

    return this.raceQueries(queries, timeout, `[THIRDPARTY+WHOIS+PARALLEL]`);
  }

  // ========== 缓存管理 ==========

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
