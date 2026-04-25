/**
 * RDAP 查询方式实现
 */

import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { BaseQueryMethod, QueryMethodType, WhoisResult } from './base';

/**
 * RDAP 查询方式
 */
export class RdapMethod extends BaseQueryMethod {
  readonly name = 'rdap';
  readonly type = QueryMethodType.RDAP;

  /**
   * 执行 RDAP 查询
   * @param domain 域名
   * @param server RDAP 服务器基础 URL（如 https://rdap.example.com/）
   */
  async query(domain: string, server: string): Promise<WhoisResult | null> {
    // 确保 URL 以 / 结尾
    const baseUrl = server.endsWith('/') ? server : `${server}/`;
    const url = `${baseUrl}domain/${domain}`;

    try {
      this.log('info', `Querying ${domain} via RDAP ${server}`);
      
      const data = await this.httpRequest(url);

      if (!data) {
        this.log('warn', `RDAP empty response for ${domain}`, { server });
        return null;
      }

      // Debug: log raw response
      const rawJson = JSON.stringify(data);
      this.log('debug', `RDAP raw response for ${domain}`, {
        server,
        raw: rawJson.substring(0, 500),
        length: rawJson.length,
      });

      // 解析 RDAP 响应
      const expiryDate = this.extractExpiryDate(data);
      const registrar = this.extractRegistrar(data);
      const nameServers = this.extractNameServers(data);

      if (expiryDate) {
        this.log('info', `Successfully extracted expiry for ${domain}`, {
          expiryDate: expiryDate.toISOString(),
          registrar,
          nameServerCount: nameServers.length,
        });
      }

      return {
        domain,
        expiryDate,
        registrar,
        nameServers,
        raw: JSON.stringify(data),
      };
    } catch (error) {
      let errorDetails: Record<string, unknown>;
      if (error instanceof Error) {
        errorDetails = {
          message: error.message,
          name: error.name,
          stack: error.stack?.substring(0, 500),
        };
      } else if (typeof error === 'object' && error !== null) {
        // 处理非标准错误对象
        errorDetails = {
          error: JSON.stringify(error).substring(0, 500),
          type: typeof error,
        };
      } else {
        errorDetails = { error: String(error) };
      }
      this.log('error', `RDAP query error for ${domain}`, errorDetails);
      return null;
    }
  }

  /**
   * 执行 HTTP/HTTPS 请求
   */
  private httpRequest(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'Accept': 'application/rdap+json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 10000,
      };

      const req = client.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const jsonData = JSON.parse(data);
              resolve(jsonData);
            } catch (e) {
              reject(new Error(`Failed to parse JSON: ${e}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * 提取到期日期
   */
  private extractExpiryDate(data: any): Date | null {
    if (data.events && Array.isArray(data.events)) {
      const expirationEvent = data.events.find((e: any) =>
        e.eventAction === 'expiration' || 
        e.eventAction === 'registration expiration' ||
        e.eventAction === 'expiry'
      );
      if (expirationEvent?.eventDate) {
        return this.parseDate(expirationEvent.eventDate);
      }
    }
    return null;
  }

  /**
   * 提取注册商
   */
  private extractRegistrar(data: any): string | null {
    if (data.entities && Array.isArray(data.entities)) {
      const registrarEntity = data.entities.find((e: any) =>
        e.roles?.includes('registrar')
      );
      if (registrarEntity?.vcardArray) {
        return this.extractFromVcard(registrarEntity.vcardArray);
      }
    }
    return null;
  }

  /**
   * 提取域名服务器
   */
  private extractNameServers(data: any): string[] {
    const nameServers: string[] = [];
    
    if (data.nameservers && Array.isArray(data.nameservers)) {
      data.nameservers.forEach((ns: any) => {
        if (ns.ldhName) {
          nameServers.push(ns.ldhName.toLowerCase());
        }
      });
    }

    return nameServers;
  }
}

// 导出单例
export const rdapMethod = new RdapMethod();
