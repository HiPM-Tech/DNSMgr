/**
 * WHOIS Service 主入口
 * 
 * 架构：
 * - providers/     查询方式插件（WHOIS/RDAP）
 * - resolvers/     域名查询商注册列表
 *   - apex-providers.ts      顶域查询商列表（含第三方预留）
 *   - subdomain-providers.ts 子域查询商列表
 * 
 * 查询顺序：
 * 1. 顶域 WHOIS（官方）
 * 2. 顶域 RDAP（官方）
 * 3. 子域 WHOIS（如 DigitalPlat）
 * 4. 子域 RDAP（如 DigitalPlat）
 * 5. 平级查询（子域名无提供商时，使用顶域查询商查询子域名）
 * 6. 第三方 WHOIS（预留）
 * 7. 第三方 RDAP（预留）
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
   * 查询顺序：
   * 1. 顶域 WHOIS（官方）
   * 2. 顶域 RDAP（官方）
   * 3. 子域 WHOIS（如果有注册）
   * 4. 子域 RDAP（如果有注册）
   * 
   * 当子域名没有注册的提供商时，使用顶域查询商进行平级查询
   */
  async query(domain: string, options: QueryOptions = {}): Promise<WhoisResult | null> {
    const { preferSubdomain = true } = options;

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

    // 1. 先尝试顶域 WHOIS
    result = await this.queryApexWhois(rootDomain);
    if (result?.expiryDate) {
      this.setCached(domain, result);
      return result;
    }

    // 2. 再尝试顶域 RDAP
    result = await this.queryApexRdap(rootDomain);
    if (result?.expiryDate) {
      this.setCached(domain, result);
      return result;
    }

    // 3. 如果是子域名，尝试子域查询
    if (preferSubdomain && domain !== rootDomain) {
      // 3.1 子域 WHOIS
      result = await this.querySubdomainWhois(domain);
      if (result?.expiryDate) {
        this.setCached(domain, result);
        return result;
      }

      // 3.2 子域 RDAP
      result = await this.querySubdomainRdap(domain);
      if (result?.expiryDate) {
        this.setCached(domain, result);
        return result;
      }

      // 3.3 子域名没有注册提供商时，使用顶域查询商进行平级查询
      if (!isSubdomainHosted(domain)) {
        log.info('WhoisService', `No subdomain provider for ${domain}, trying apex providers directly`);
        
        // 使用顶域 WHOIS 查询子域名
        result = await this.queryApexWhois(domain);
        if (result?.expiryDate) {
          this.setCached(domain, result);
          return result;
        }

        // 使用顶域 RDAP 查询子域名
        result = await this.queryApexRdap(domain);
        if (result?.expiryDate) {
          this.setCached(domain, result);
          return result;
        }
      }
    }

    // 4. 尝试第三方查询服务器（最后备选）
    result = await this.queryThirdPartyWhois(domain);
    if (result?.expiryDate) {
      this.setCached(domain, result);
      return result;
    }

    result = await this.queryThirdPartyRdap(domain);
    if (result?.expiryDate) {
      this.setCached(domain, result);
      return result;
    }

    log.warn('WhoisService', `All queries failed for ${domain}`);
    return null;
  }

  /**
   * 查询顶域 WHOIS
   */
  private async queryApexWhois(domain: string): Promise<WhoisResult | null> {
    const provider = findApexWhoisProvider(domain);
    if (!provider) {
      log.debug('WhoisService', `No WHOIS provider for ${domain}`);
      return null;
    }

    try {
      log.info('WhoisService', `Querying ${domain} via WHOIS ${provider.name}`);
      const result = await whoisMethod.query(domain, provider.server);
      if (result?.expiryDate) {
        log.info('WhoisService', `WHOIS ${provider.name} succeeded for ${domain}`);
        return result;
      }
    } catch (error) {
      log.warn('WhoisService', `WHOIS ${provider.name} failed for ${domain}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  /**
   * 查询顶域 RDAP
   */
  private async queryApexRdap(domain: string): Promise<WhoisResult | null> {
    const provider = findApexRdapProvider(domain);
    if (!provider) {
      log.debug('WhoisService', `No RDAP provider for ${domain}`);
      return null;
    }

    try {
      log.info('WhoisService', `Querying ${domain} via RDAP ${provider.name}`);
      const result = await rdapMethod.query(domain, provider.server);
      if (result?.expiryDate) {
        log.info('WhoisService', `RDAP ${provider.name} succeeded for ${domain}`);
        return result;
      }
    } catch (error) {
      log.warn('WhoisService', `RDAP ${provider.name} failed for ${domain}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  /**
   * 查询子域 WHOIS
   */
  private async querySubdomainWhois(domain: string): Promise<WhoisResult | null> {
    const provider = findSubdomainWhoisProvider(domain);
    if (!provider) {
      log.debug('WhoisService', `No subdomain WHOIS provider for ${domain}`);
      return null;
    }

    try {
      log.info('WhoisService', `Querying ${domain} via subdomain WHOIS ${provider.name}`);
      const result = await whoisMethod.query(domain, provider.server);
      if (result?.expiryDate) {
        log.info('WhoisService', `Subdomain WHOIS ${provider.name} succeeded for ${domain}`);
        return result;
      }
    } catch (error) {
      log.warn('WhoisService', `Subdomain WHOIS ${provider.name} failed for ${domain}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  /**
   * 查询子域 RDAP
   */
  private async querySubdomainRdap(domain: string): Promise<WhoisResult | null> {
    const provider = findSubdomainRdapProvider(domain);
    if (!provider) {
      log.debug('WhoisService', `No subdomain RDAP provider for ${domain}`);
      return null;
    }

    try {
      log.info('WhoisService', `Querying ${domain} via subdomain RDAP ${provider.name}`);
      const result = await rdapMethod.query(domain, provider.server);
      if (result?.expiryDate) {
        log.info('WhoisService', `Subdomain RDAP ${provider.name} succeeded for ${domain}`);
        return result;
      }
    } catch (error) {
      log.warn('WhoisService', `Subdomain RDAP ${provider.name} failed for ${domain}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  /**
   * 查询第三方 WHOIS
   */
  private async queryThirdPartyWhois(domain: string): Promise<WhoisResult | null> {
    const provider = findThirdPartyWhoisProvider(domain);
    if (!provider) {
      log.debug('WhoisService', `No third-party WHOIS provider for ${domain}`);
      return null;
    }

    try {
      log.info('WhoisService', `Querying ${domain} via third-party WHOIS ${provider.name}`);
      const result = await whoisMethod.query(domain, provider.server);
      if (result?.expiryDate) {
        log.info('WhoisService', `Third-party WHOIS ${provider.name} succeeded for ${domain}`);
        return result;
      }
    } catch (error) {
      log.warn('WhoisService', `Third-party WHOIS ${provider.name} failed for ${domain}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  /**
   * 查询第三方 RDAP
   */
  private async queryThirdPartyRdap(domain: string): Promise<WhoisResult | null> {
    const provider = findThirdPartyRdapProvider(domain);
    if (!provider) {
      log.debug('WhoisService', `No third-party RDAP provider for ${domain}`);
      return null;
    }

    try {
      log.info('WhoisService', `Querying ${domain} via third-party RDAP ${provider.name}`);
      const result = await rdapMethod.query(domain, provider.server);
      if (result?.expiryDate) {
        log.info('WhoisService', `Third-party RDAP ${provider.name} succeeded for ${domain}`);
        return result;
      }
    } catch (error) {
      log.warn('WhoisService', `Third-party RDAP ${provider.name} failed for ${domain}`, {
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
