/**
 * RDAP 查询方式实现
 */

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
      
      const response = await fetch(url, {
        headers: { 
          'Accept': 'application/rdap+json',
          'User-Agent': 'DNSMgr/1.2.0'
        },
      });

      if (!response.ok) {
        this.log('warn', `RDAP HTTP ${response.status} for ${domain}`, {
          status: response.status,
          statusText: response.statusText,
        });
        return null;
      }

      const data = await response.json();

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
      this.log('error', `RDAP query error for ${domain}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
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
