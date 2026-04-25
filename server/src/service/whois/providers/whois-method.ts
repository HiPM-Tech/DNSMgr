/**
 * WHOIS 查询方式实现
 */

import * as net from 'net';
import { BaseQueryMethod, QueryMethodType, WhoisResult } from './base';

/**
 * WHOIS 查询方式
 */
export class WhoisMethod extends BaseQueryMethod {
  readonly name = 'whois';
  readonly type = QueryMethodType.WHOIS;

  /**
   * 执行 WHOIS 查询
   * @param domain 域名
   * @param server WHOIS 服务器地址（host:port 或 host）
   */
  async query(domain: string, server: string): Promise<WhoisResult | null> {
    const [host, portStr] = server.split(':');
    const port = portStr ? parseInt(portStr) : 43;

    try {
      this.log('info', `Querying ${domain} via WHOIS ${server}`);
      const raw = await this.whoisLookup(domain, host, port);

      // Debug: log raw response
      this.log('debug', `WHOIS raw response for ${domain}`, { 
        server, 
        raw: raw.substring(0, 500),
        length: raw.length 
      });

      if (!raw || this.isNotFound(raw)) {
        this.log('warn', `Domain ${domain} not found in WHOIS`, { server, raw: raw.substring(0, 200) });
        return null;
      }

      const expiryDate = this.extractExpiryDate(raw);
      const registrar = this.extractRegistrar(raw);
      const nameServers = this.extractNameServers(raw);

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
        raw,
      };
    } catch (error) {
      this.log('error', `WHOIS query error for ${domain}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * 执行 WHOIS 查询
   */
  private async whoisLookup(domain: string, host: string, port: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let data = '';

      socket.setTimeout(10000);

      socket.on('connect', () => {
        socket.write(`${domain}\r\n`);
      });

      socket.on('data', (chunk) => {
        data += chunk.toString();
      });

      socket.on('close', () => {
        resolve(data);
      });

      socket.on('error', (err) => {
        reject(err);
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('WHOIS query timeout'));
      });

      socket.connect(port, host);
    });
  }

  /**
   * 检查是否为未找到
   */
  private isNotFound(raw: string): boolean {
    const notFoundPatterns = [
      'No match',
      'NOT FOUND',
      'Not found',
      'No entries found',
      'Domain not found',
    ];
    return notFoundPatterns.some(p => raw.includes(p));
  }

  /**
   * 提取到期日期
   */
  private extractExpiryDate(whoisText: string): Date | null {
    const patterns = [
      /Registry Expiry Date:\s*(.+)/i,
      /Expiry Date:\s*(.+)/i,
      /Registrar Registration Expiration Date:\s*(.+)/i,
      /Expiration Date:\s*(.+)/i,
      /expires:\s*(.+)/i,
      /Expiration Time:\s*(.+)/i,
      /paid-till:\s*(.+)/i,
      /Renewal Date:\s*(.+)/i,
      /Domain Expiration Date:\s*(.+)/i,
      /Expire Date:\s*(.+)/i,
      /Valid Until:\s*(.+)/i,
      /Valid-Until:\s*(.+)/i,
      /expire:\s*(.+)/i,
      /Expiry:\s*(.+)/i,
      /Expiration:\s*(.+)/i,
    ];

    for (const pattern of patterns) {
      const match = whoisText.match(pattern);
      if (match) {
        const date = this.parseDate(match[1].trim());
        if (date) return date;
      }
    }

    return null;
  }

  /**
   * 提取注册商
   */
  private extractRegistrar(whoisText: string): string | null {
    const patterns = [
      /Registrar:\s*(.+)/i,
      /Sponsoring Registrar:\s*(.+)/i,
      /Registrar Name:\s*(.+)/i,
    ];

    for (const pattern of patterns) {
      const match = whoisText.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * 提取域名服务器
   */
  private extractNameServers(whoisText: string): string[] {
    const ns: string[] = [];
    const patterns = [
      /Name Server:\s*(.+)/gi,
      /Nserver:\s*(.+)/gi,
      /NS:\s*(.+)/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(whoisText)) !== null) {
        ns.push(match[1].trim().toLowerCase());
      }
    }

    return [...new Set(ns)];
  }
}

// 导出单例
export const whoisMethod = new WhoisMethod();
