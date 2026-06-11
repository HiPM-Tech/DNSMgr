/**
 * WHOIS 查询编排服务
 *
 * 仿照 DnsHelper.ts 模式：
 * - getAdapter() 通过 registry 按需解析适配器
 * - 分层并行竞速策略
 * - 各适配器自带超时，无复杂竞速逻辑
 */

import { WhoisResult, WhoisProviderDefinition, WhoisAdapter } from './types';
import { getAdapter, APEX_PROVIDERS, SUBDOMAIN_PROVIDERS, THIRD_PARTY_PROVIDERS, findProviders, filterByMethod } from './registry';
import { findRdapServer } from './rdap-server-list';
import { getRootDomain } from './domain-utils';
import { dnsProviderWhoisRegistry } from './methods/dns-provider.registry';
import { createLogger } from '../../lib/logger';

const log = createLogger('WhoisService').sub('Lookup');

export interface QueryOptions {
  preferSubdomain?: boolean;
  timeout?: number;
  useCache?: boolean;
  skipParentFallback?: boolean;
  skipUplevel?: boolean;
}

interface CacheEntry {
  result: WhoisResult;
  timestamp: number;
}

export class WhoisLookup {
  private cache = new Map<string, CacheEntry>();
  private cacheTtl = 6 * 60 * 60 * 1000;

  async query(domain: string, options: QueryOptions = {}): Promise<WhoisResult | null> {
    const { preferSubdomain = true, timeout = 30000, skipParentFallback = false, skipUplevel = false } = options;

    const cached = this.getCached(domain);
    if (cached) return cached;

    const rootDomain = getRootDomain(domain);
    const isSub = domain !== rootDomain;

    // 顶域：走 RDAP → WHOIS → DNS → 第三方
    if (!isSub) return this.queryApexOnly(domain, timeout);
    if (skipParentFallback) return this.querySubdomainOnly(domain, timeout, skipUplevel);

    // 子域：DNS Provider 优先
    const dnsResult = await this.queryDnsProvider(domain);
    if (dnsResult?.expiryDate) {
      // 填充顶域到期时间
      const apexResult = await this.queryApexCombined(rootDomain, timeout);
      if (apexResult?.expiryDate) {
        dnsResult.apexExpiryDate = apexResult.expiryDate;
        dnsResult.apexRegistrar = apexResult.registrar;
      }
      this.setCached(domain, dnsResult);
      return dnsResult;
    }

    // DNS 无结果，走标准协议并行
    const [apexResult, subResult] = await Promise.all([
      this.queryApexCombined(rootDomain, timeout),
      preferSubdomain ? this.querySubdomainCombined(domain, timeout, skipUplevel) : Promise.resolve(null),
    ]);

    if (subResult?.expiryDate) {
      if (apexResult?.expiryDate) {
        subResult.apexExpiryDate = apexResult.expiryDate;
        subResult.apexRegistrar = apexResult.registrar;
      }
      this.setCached(domain, subResult);
      return subResult;
    }

    if (apexResult?.expiryDate) {
      const result: WhoisResult = {
        domain, expiryDate: apexResult.expiryDate, registrar: apexResult.registrar,
        nameServers: apexResult.nameServers, raw: apexResult.raw,
        apexExpiryDate: apexResult.expiryDate, apexRegistrar: apexResult.registrar,
      };
      this.setCached(domain, result);
      return result;
    }

    const [rootR, subR] = await Promise.all([
      this.queryThirdParty(rootDomain, timeout),
      domain !== rootDomain ? this.queryThirdParty(domain, timeout) : Promise.resolve(null),
    ]);

    if (subR?.expiryDate) {
      if (rootR?.expiryDate) { subR.apexExpiryDate = rootR.expiryDate; subR.apexRegistrar = rootR.registrar; }
      this.setCached(domain, subR);
      return subR;
    }
    if (rootR?.expiryDate) {
      const result: WhoisResult = {
        domain, expiryDate: rootR.expiryDate, registrar: rootR.registrar,
        nameServers: rootR.nameServers, raw: rootR.raw,
        apexExpiryDate: rootR.expiryDate, apexRegistrar: rootR.registrar,
      };
      this.setCached(domain, result);
      return result;
    }

    return null;
  }

  clearCache(domain?: string): void {
    if (domain) this.cache.delete(domain);
    else this.cache.clear();
  }

  // ========== DNS 提供商查询 ==========

  /** 查询 DNS 提供商 WHOIS 数据源（需要账号授权配置） */
  private async queryDnsProvider(domain: string): Promise<WhoisResult | null> {
    try {
      const { DomainOperations, DnsAccountOperations } = await import('../../db/bal/business-adapter');
      const domainObj = await DomainOperations.getByName(domain) as any;
      if (!domainObj?.account_id) return null;

      const account = await DnsAccountOperations.getById(domainObj.account_id) as any;
      if (!account?.enabled) return null;

      const source = dnsProviderWhoisRegistry.getSource(account.type as string);
      if (!source) return null;

      const config = typeof account.config === 'string'
        ? JSON.parse(account.config)
        : account.config;

      const result = await source.query(domain, config);
      if (result?.expiryDate) {
        log.info(`[DNS Provider] ${account.type} returned expiry for ${domain}: ${result.expiryDate.toISOString()}`);
      }
      return result;
    } catch (error) {
      log.debug(`[DNS Provider] query failed for ${domain}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // ========== 内部查询 ==========

  /** 顶域：RDAP → WHOIS → DNS Provider → HTTP API → 第三方 */
  private async queryApexOnly(domain: string, timeout: number): Promise<WhoisResult | null> {
    let r = await this.queryRegistry(domain, APEX_PROVIDERS, 'rdap', timeout) ||
             await this.queryRegistry(domain, APEX_PROVIDERS, 'whois', timeout);
    if (r?.expiryDate) { this.setCached(domain, r); return r; }
    r = await this.queryDnsProvider(domain);
    if (r?.expiryDate) { this.setCached(domain, r); return r; }
    r = await this.queryRegistry(domain, APEX_PROVIDERS, 'http-api', timeout);
    if (r?.expiryDate) { this.setCached(domain, r); return r; }
    r = await this.queryThirdParty(domain, timeout);
    if (r?.expiryDate) { this.setCached(domain, r); return r; }
    return null;
  }

  /** 顶域（填充用）：RDAP → WHOIS → DNS Provider → HTTP API */
  private async queryApexCombined(domain: string, timeout: number): Promise<WhoisResult | null> {
    let r = await this.queryRegistry(domain, APEX_PROVIDERS, 'rdap', timeout) ||
             await this.queryRegistry(domain, APEX_PROVIDERS, 'whois', timeout);
    if (r?.expiryDate) return r;
    r = await this.queryDnsProvider(domain);
    if (r?.expiryDate) return r;
    return this.queryRegistry(domain, APEX_PROVIDERS, 'http-api', timeout);
  }

  /** 纯子域查询（skipParentFallback）：DNS → RDAP → WHOIS → HTTP-API → 第三方 */
  private async querySubdomainOnly(domain: string, timeout: number, skipUplevel = false): Promise<WhoisResult | null> {
    let r = await this.queryDnsProvider(domain);
    if (r?.expiryDate) { this.setCached(domain, r); return r; }

    r = await this.queryRegistry(domain, SUBDOMAIN_PROVIDERS, 'rdap', timeout) ||
        await this.queryRegistry(domain, SUBDOMAIN_PROVIDERS, 'whois', timeout) ||
        await this.queryRegistry(domain, SUBDOMAIN_PROVIDERS, 'http-api', timeout);
    if (r?.expiryDate) { this.setCached(domain, r); return r; }

    if (!skipUplevel) {
      r = await this.queryAll(SUBDOMAIN_PROVIDERS, 'rdap', timeout) ||
          await this.queryAll(SUBDOMAIN_PROVIDERS, 'whois', timeout) ||
          await this.queryAll(SUBDOMAIN_PROVIDERS, 'http-api', timeout);
      if (r?.expiryDate) { this.setCached(domain, r); return r; }
    }

    r = await this.queryThirdParty(domain, timeout);
    if (r?.expiryDate) { this.setCached(domain, r); return r; }
    return null;
  }

  /** 子域并行查询（不含 DNS — 已在 query() 中优先处理） */
  private async querySubdomainCombined(domain: string, timeout: number, skipUplevel = false): Promise<WhoisResult | null> {
    const promises = [
      this.queryRegistry(domain, SUBDOMAIN_PROVIDERS, 'rdap', timeout),
      this.queryRegistry(domain, SUBDOMAIN_PROVIDERS, 'whois', timeout),
      this.queryRegistry(domain, SUBDOMAIN_PROVIDERS, 'http-api', timeout),
    ];
    if (!skipUplevel) {
      promises.push(
        this.queryAll(SUBDOMAIN_PROVIDERS, 'rdap', timeout),
        this.queryAll(SUBDOMAIN_PROVIDERS, 'whois', timeout),
        this.queryAll(SUBDOMAIN_PROVIDERS, 'http-api', timeout),
      );
    }
    const results = await Promise.all(promises);
    return results.find(r => r?.expiryDate) || null;
  }

  private async queryThirdParty(domain: string, _timeout: number): Promise<WhoisResult | null> {
    return this.queryRegistry(domain, THIRD_PARTY_PROVIDERS, 'rdap') ||
           this.queryRegistry(domain, THIRD_PARTY_PROVIDERS, 'whois');
  }

  /** 从列表中找匹配的提供商（按 suffix），按 method 筛选，并行查询 */
  private async queryRegistry(
    domain: string, list: WhoisProviderDefinition[], method: string, _timeout?: number,
  ): Promise<WhoisResult | null> {
    let providers = filterByMethod(findProviders(list, domain), method as any);
    if (providers.length === 0) return null;

    // 顶域 RDAP 特殊处理：优先 IANA
    if (list === APEX_PROVIDERS && method === 'rdap') {
      const iana = await tryIanaRdap(domain);
      if (iana) providers = [iana, ...providers.filter(p => !p.suffixes.some(s => iana.suffixes.includes(s)))];
    }

    const results = await Promise.all(providers.map(p => querySingle(domain, p)));
    return results.find(r => r?.expiryDate) || null;
  }

  /** 无视 suffix 匹配，使用所有提供商（平级查询） */
  private async queryAll(list: WhoisProviderDefinition[], method: string, _timeout?: number): Promise<WhoisResult | null> {
    const providers = filterByMethod(list, method as any);
    if (providers.length === 0) return null;
    const results = await Promise.all(providers.map(p => querySingle('', p)));
    return results.find(r => r?.expiryDate) || null;
  }

  // ========== 缓存 ==========

  private getCached(domain: string): WhoisResult | null {
    const entry = this.cache.get(domain);
    if (entry && Date.now() - entry.timestamp < this.cacheTtl) return entry.result;
    return null;
  }

  private setCached(domain: string, result: WhoisResult): void {
    this.cache.set(domain, { result, timestamp: Date.now() });
  }
}

// ========== 独立函数 ==========

async function querySingle(domain: string, def: WhoisProviderDefinition): Promise<WhoisResult | null> {
  try {
    const adapter: WhoisAdapter = getAdapter(def);
    return await adapter.query(domain, def.server);
  } catch {
    return null;
  }
}

async function tryIanaRdap(domain: string): Promise<WhoisProviderDefinition | null> {
  try {
    const tld = domain.toLowerCase().split('.').pop()!;
    const server = await findRdapServer(tld);
    if (server) return { name: `iana-rdap-${tld}`, suffixes: [tld], method: 'rdap', server };
  } catch { /* ignore */ }
  return null;
}

export const whoisLookup = new WhoisLookup();

// 向后兼容
export const whoisService = whoisLookup;

export async function queryWhois(domain: string): Promise<WhoisResult | null> {
  return whoisLookup.query(domain);
}
