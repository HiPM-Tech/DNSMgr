/**
 * DNS 解析器核心实现
 */

import { DNSQueryType, DNSResponse, DNSQueryOptions, DNSResolverResult, DNSServerType } from './types';
import { dnsServerRegistry } from './servers';
import { queryDoH } from './doh-resolver';
import { queryDoT as queryDoTImpl } from './dot-resolver';
import { queryPlainDNS as queryPlainDNSImpl } from './plain-resolver';
import { createTLSViaProxy, parseProxyUrl } from './proxy-tunnel';
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
          // DoT 查询，支持代理
          if (useProxy && server.proxyEnabled) {
            response = await this.queryDoTWithProxy(domain, type, server.address, timeout);
          } else {
            response = await queryDoTImpl(domain, type, server.address, timeout);
          }
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
    return queryDoTImpl(domain, type, address, timeout);
  }

  /**
   * 使用代理查询 DoT (DNS over TLS)
   */
  private async queryDoTWithProxy(
    domain: string,
    type: DNSQueryType,
    address: string,
    timeout: number
  ): Promise<DNSResponse | null> {
    try {
      const proxyConfig = await getProxyConfig();
      if (!proxyConfig || !proxyConfig.enabled) {
        return await queryDoTImpl(domain, type, address, timeout);
      }

      log.debug('DNSResolver', `Using proxy for DoT query: ${domain}`);

      const [host, portStr] = address.split(':');
      const port = parseInt(portStr) || 853;

      // 构建代理配置
      const proxyCfg: import('./proxy-tunnel').ProxyConfig = {
        host: proxyConfig.host || 'localhost',
        port: proxyConfig.port || 8080,
        protocol: proxyConfig.type === 'socks5' ? 'http' : (proxyConfig.type as 'http' | 'https') || 'http',
      };
      
      if (proxyConfig.username && proxyConfig.password) {
        proxyCfg.auth = {
          username: proxyConfig.username,
          password: proxyConfig.password,
        };
      }

      // 通过代理建立 TLS 连接
      const tlsSocket = await createTLSViaProxy(
        host,
        port,
        proxyCfg,
        { servername: host },
        timeout
      );

      // 使用 TLS socket 发送 DNS 查询
      return new Promise((resolve) => {
        const { encodeDNSQuery, decodeDNSResponse } = require('./doh-resolver');
        const queryBuffer = encodeDNSQuery(domain, type);
        const dotBuffer = Buffer.alloc(2 + queryBuffer.length);
        dotBuffer.writeUInt16BE(queryBuffer.length, 0);
        queryBuffer.copy(dotBuffer, 2);

        let dataBuffer = Buffer.alloc(0);
        let expectedLength = 0;

        tlsSocket.write(dotBuffer);

        tlsSocket.on('data', (data) => {
          dataBuffer = Buffer.concat([dataBuffer, data]);

          if (expectedLength === 0 && dataBuffer.length >= 2) {
            expectedLength = dataBuffer.readUInt16BE(0) + 2;
          }

          if (expectedLength > 0 && dataBuffer.length >= expectedLength) {
            try {
              const responseData = dataBuffer.slice(2, expectedLength);
              const response = decodeDNSResponse(responseData);
              response.source = `dot+proxy://${address}`;
              tlsSocket.end();
              resolve(response);
            } catch (error) {
              log.error('DNSResolver', `Failed to decode DoT+Proxy response: ${domain}`, {
                error: error instanceof Error ? error.message : String(error),
              });
              tlsSocket.end();
              resolve(null);
            }
          }
        });

        tlsSocket.on('error', (error) => {
          log.error('DNSResolver', `DoT+Proxy socket error: ${domain}`, {
            error: error.message,
          });
          resolve(null);
        });

        tlsSocket.on('timeout', () => {
          log.debug('DNSResolver', `DoT+Proxy timeout: ${domain}`);
          tlsSocket.end();
          resolve(null);
        });
      });
    } catch (error) {
      log.error('DNSResolver', `DoT query with proxy failed: ${domain}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
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
        const response = await this.queryPlainDNSInternal(domain, type, server.address, server.type, timeout);

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
  private async queryPlainDNSInternal(
    domain: string,
    type: DNSQueryType,
    address: string,
    protocol: DNSServerType,
    timeout: number
  ): Promise<DNSResponse | null> {
    return queryPlainDNSImpl(domain, type, address, protocol, timeout);
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
   * 解析 NS 记录（双重查询：加密 + 明文）
   * 用于检测 DNS 污染
   */
  async resolveNSWithValidation(domain: string): Promise<{
    encrypted: DNSResolverResult;
    plain: DNSResolverResult;
    isPoisoned: boolean;
    nsRecords: string[];
  }> {
    const normalizedDomain = domain.replace(/\.$/, '').toLowerCase();
    const timeout = 10000;

    // 并行查询加密 DNS 和明文 DNS
    const [encryptedResult, plainResult] = await Promise.all([
      this.queryEncrypted(normalizedDomain, DNSQueryType.NS, timeout, true),
      this.queryPlain(normalizedDomain, DNSQueryType.NS, timeout),
    ]);

    // 检查是否被污染
    let isPoisoned = false;

    // 如果加密查询成功但明文查询失败，可能是网络问题
    // 如果两者都成功但结果不同，可能是 DNS 污染
    if (encryptedResult.success && plainResult.success) {
      const encryptedNS = encryptedResult.records?.map(r => r.data).sort() || [];
      const plainNS = plainResult.records?.map(r => r.data).sort() || [];

      if (encryptedNS.length !== plainNS.length) {
        isPoisoned = true;
      } else {
        for (let i = 0; i < encryptedNS.length; i++) {
          if (encryptedNS[i] !== plainNS[i]) {
            isPoisoned = true;
            break;
          }
        }
      }
    }

    // 优先使用加密 DNS 的结果
    const nsRecords = encryptedResult.success && encryptedResult.records
      ? encryptedResult.records.map(r => r.data)
      : plainResult.success && plainResult.records
        ? plainResult.records.map(r => r.data)
        : [];

    if (isPoisoned) {
      log.warn('DNSResolver', `DNS poisoning detected for ${domain}`, {
        encrypted: encryptedResult.records?.map(r => r.data),
        plain: plainResult.records?.map(r => r.data),
      });
    }

    return {
      encrypted: encryptedResult,
      plain: plainResult,
      isPoisoned,
      nsRecords,
    };
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

  // ==================== 导出查询方法 ====================

  /**
   * 导出：查询加密 DNS（DoH/DoT）
   */
  async resolveEncrypted(
    domain: string,
    type: DNSQueryType = DNSQueryType.A,
    timeout: number = 5000,
    useProxy: boolean = true
  ): Promise<DNSResolverResult> {
    return this.queryEncrypted(domain, type, timeout, useProxy);
  }

  /**
   * 导出：查询明文 DNS（UDP/TCP）
   */
  async resolvePlain(
    domain: string,
    type: DNSQueryType = DNSQueryType.A,
    timeout: number = 5000
  ): Promise<DNSResolverResult> {
    return this.queryPlain(domain, type, timeout);
  }

  /**
   * 导出：查询系统 DNS
   */
  async resolveSystem(
    domain: string,
    type: DNSQueryType = DNSQueryType.A,
    timeout: number = 5000
  ): Promise<DNSResolverResult> {
    return this.querySystem(domain, type, timeout);
  }
}

// 导出单例
export const dnsResolver = new DNSResolver();
