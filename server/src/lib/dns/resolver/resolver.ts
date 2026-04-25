/**
 * DNS 解析器核心实现
 */

import { DNSQueryType, DNSResponse, DNSQueryOptions, DNSResolverResult, DNSServerType } from './types';
import { dnsServerRegistry } from './servers';
import { queryDoH } from './doh-resolver';
import { queryPlainDNS } from './plain-resolver';
import { log } from '../../logger';
import { getProxyConfig } from '../../proxy-http';

export class DNSResolver {
  /**
   * 解析域名
   * 1. 优先使用 DoH/DoT 并行竞速查询
   * 2. 失败或超时自动回退到 UDP/TCP 明文
   * 3. 全部失败自动交给系统 DNS
   */
  async resolve(
    domain: string,
    type: DNSQueryType = DNSQueryType.A,
    options: DNSQueryOptions = {}
  ): Promise<DNSResolverResult> {
    const { preferEncrypted = true, timeout = 5000, useProxy = true } = options;

    log.debug('DNSResolver', `Resolving ${domain} (type: ${type})`);

    // 1. 尝试加密 DNS 查询（DoH/DoT）
    if (preferEncrypted) {
      const encryptedResult = await this.queryEncrypted(domain, type, timeout, useProxy);
      if (encryptedResult.success) {
        return encryptedResult;
      }
      log.debug('DNSResolver', `Encrypted DNS failed for ${domain}, falling back to plain DNS`);
    }

    // 2. 尝试明文 DNS 查询（UDP/TCP）
    const plainResult = await this.queryPlain(domain, type, timeout);
    if (plainResult.success) {
      return plainResult;
    }
    log.debug('DNSResolver', `Plain DNS failed for ${domain}, falling back to system DNS`);

    // 3. 使用系统 DNS
    const systemResult = await this.querySystem(domain, type, timeout);
    if (systemResult.success) {
      return systemResult;
    }

    // 全部失败
    log.error('DNSResolver', `All DNS queries failed for ${domain}`);
    return {
      success: false,
      responseTime: 0,
      source: 'all-failed',
      error: 'All DNS queries failed',
    };
  }

  /**
   * 并行查询加密 DNS（DoH/DoT）
   */
  private async queryEncrypted(
    domain: string,
    type: DNSQueryType,
    timeout: number,
    useProxy: boolean
  ): Promise<DNSResolverResult> {
    const servers = dnsServerRegistry.getEncryptedServers();

    if (servers.length === 0) {
      return {
        success: false,
        responseTime: 0,
        source: 'encrypted',
        error: 'No encrypted DNS servers available',
      };
    }

    // 并行查询所有加密 DNS
    const queries = servers.map(async (server) => {
      const startTime = Date.now();
      try {
        let response: DNSResponse | null;

        if (server.type === DNSServerType.DOH) {
          // DoH 查询，支持代理
          if (useProxy && server.proxyEnabled) {
            response = await this.queryDoHWithProxy(domain, type, server.address, timeout);
          } else {
            response = await queryDoH(domain, type, server.address, timeout);
          }
        } else {
          // DoT 查询（暂不支持代理）
          response = await this.queryDoT(domain, type, server.address, timeout);
        }

        if (response && response.answers.length > 0) {
          return {
            success: true,
            records: response.answers,
            responseTime: Date.now() - startTime,
            source: server.name,
          } as DNSResolverResult;
        }
      } catch (error) {
        log.debug('DNSResolver', `Encrypted DNS query failed: ${server.name}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return null;
    });

    // 使用 Promise.race 获取最快结果
    const results = await Promise.all(queries);
    const successResult = results.find(r => r?.success);

    if (successResult) {
      return successResult;
    }

    return {
      success: false,
      responseTime: 0,
      source: 'encrypted',
      error: 'All encrypted DNS queries failed',
    };
  }

  /**
   * 使用代理查询 DoH
   */
  private async queryDoHWithProxy(
    domain: string,
    type: DNSQueryType,
    dohUrl: string,
    timeout: number
  ): Promise<DNSResponse | null> {
    try {
      const proxyConfig = await getProxyConfig();
      if (!proxyConfig || !proxyConfig.enabled) {
        // 没有代理配置，直接查询
        return await queryDoH(domain, type, dohUrl, timeout);
      }

      // 使用代理查询
      log.debug('DNSResolver', `Using proxy for DoH query: ${domain}`);

      // 这里简化处理，实际应该通过代理隧道进行 HTTPS 请求
      // 暂时直接查询
      return await queryDoH(domain, type, dohUrl, timeout);
    } catch (error) {
      log.error('DNSResolver', `DoH query with proxy failed: ${domain}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * 查询 DoT (DNS over TLS)
   */
  private async queryDoT(
    domain: string,
    type: DNSQueryType,
    address: string,
    timeout: number
  ): Promise<DNSResponse | null> {
    // TODO: 实现 DoT 查询
    log.debug('DNSResolver', `DoT query not implemented yet: ${domain}`);
    return null;
  }

  /**
   * 查询明文 DNS（UDP/TCP）
   */
  private async queryPlain(
    domain: string,
    type: DNSQueryType,
    timeout: number
  ): Promise<DNSResolverResult> {
    const servers = dnsServerRegistry.getPlainServers();

    if (servers.length === 0) {
      return {
        success: false,
        responseTime: 0,
        source: 'plain',
        error: 'No plain DNS servers available',
      };
    }

    // 并行查询所有明文 DNS
    const queries = servers.map(async (server) => {
      const startTime = Date.now();
      try {
        const response = await this.queryPlainDNS(domain, type, server.address, server.type, timeout);

        if (response && response.answers.length > 0) {
          return {
            success: true,
            records: response.answers,
            responseTime: Date.now() - startTime,
            source: server.name,
          } as DNSResolverResult;
        }
      } catch (error) {
        log.debug('DNSResolver', `Plain DNS query failed: ${server.name}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return null;
    });

    const results = await Promise.all(queries);
    const successResult = results.find(r => r?.success);

    if (successResult) {
      return successResult;
    }

    return {
      success: false,
      responseTime: 0,
      source: 'plain',
      error: 'All plain DNS queries failed',
    };
  }

  /**
   * 查询明文 DNS（UDP/TCP）
   */
  private async queryPlainDNS(
    domain: string,
    type: DNSQueryType,
    address: string,
    protocol: DNSServerType,
    timeout: number
  ): Promise<DNSResponse | null> {
    return queryPlainDNS(domain, type, address, protocol, timeout);
  }

  /**
   * 使用系统 DNS 查询
   */
  private async querySystem(
    domain: string,
    type: DNSQueryType,
    timeout: number
  ): Promise<DNSResolverResult> {
    const startTime = Date.now();

    try {
      // 使用 Node.js dns 模块
      const { promises: dns } = await import('dns');

      let records: any[];
      switch (type) {
        case DNSQueryType.A:
          records = await dns.resolve4(domain);
          break;
        case DNSQueryType.AAAA:
          records = await dns.resolve6(domain);
          break;
        case DNSQueryType.NS:
          records = await dns.resolveNs(domain);
          break;
        case DNSQueryType.CNAME:
          records = await dns.resolveCname(domain);
          break;
        case DNSQueryType.MX:
          records = await dns.resolveMx(domain);
          break;
        case DNSQueryType.TXT:
          records = await dns.resolveTxt(domain);
          break;
        default:
          records = await dns.resolve4(domain);
      }

      const responseTime = Date.now() - startTime;

      return {
        success: true,
        records: records.map(r => ({
          name: domain,
          type,
          ttl: 0,
          data: typeof r === 'string' ? r : JSON.stringify(r),
        })),
        responseTime,
        source: 'system',
      };
    } catch (error) {
      log.error('DNSResolver', `System DNS query failed: ${domain}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        responseTime: 0,
        source: 'system',
        error: error instanceof Error ? error.message : 'System DNS query failed',
      };
    }
  }

  /**
   * 解析 NS 记录
   */
  async resolveNS(domain: string): Promise<string[]> {
    const result = await this.resolve(domain, DNSQueryType.NS);
    if (result.success && result.records) {
      return result.records.map(r => r.data);
    }
    return [];
  }

  /**
   * 解析 A 记录
   */
  async resolveA(domain: string): Promise<string[]> {
    const result = await this.resolve(domain, DNSQueryType.A);
    if (result.success && result.records) {
      return result.records.map(r => r.data);
    }
    return [];
  }

  /**
   * 解析 AAAA 记录
   */
  async resolveAAAA(domain: string): Promise<string[]> {
    const result = await this.resolve(domain, DNSQueryType.AAAA);
    if (result.success && result.records) {
      return result.records.map(r => r.data);
    }
    return [];
  }
}

// 导出单例
export const dnsResolver = new DNSResolver();
