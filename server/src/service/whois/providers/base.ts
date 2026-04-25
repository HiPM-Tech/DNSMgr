/**
 * WHOIS/RDAP 查询方式基础接口
 * 定义查询协议的基础能力
 */

import { log } from '../../../lib/logger';

/**
 * WHOIS 查询结果
 */
export interface WhoisResult {
  domain: string;
  expiryDate: Date | null;
  registrar: string | null;
  nameServers: string[];
  raw: string;
  apexExpiryDate?: Date | null;
  apexRegistrar?: string | null;
}

/**
 * 查询方式类型
 */
export enum QueryMethodType {
  WHOIS = 'whois',
  RDAP = 'rdap',
}

/**
 * 查询方式接口
 * 实现具体的查询协议（WHOIS/RDAP）
 */
export interface IQueryMethod {
  /** 查询方式名称 */
  readonly name: string;
  /** 查询方式类型 */
  readonly type: QueryMethodType;

  /**
   * 执行查询
   * @param domain 域名
   * @param server 服务器地址（WHOIS为host:port，RDAP为URL前缀）
   */
  query(domain: string, server: string): Promise<WhoisResult | null>;
}

/**
 * 抽象查询方式基类
 */
export abstract class BaseQueryMethod implements IQueryMethod {
  abstract readonly name: string;
  abstract readonly type: QueryMethodType;

  /**
   * 执行查询
   */
  abstract query(domain: string, server: string): Promise<WhoisResult | null>;

  /**
   * 解析各种日期格式
   */
  protected parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    // 尝试直接解析
    let d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;

    // 处理自定义格式
    const formats = [
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
      /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/,
      /^(\d{4})-(\d{2})-(\d{2})/,
      /^(\d{4})\/(\d{2})\/(\d{2})/,
      /^(\d{2})\/(\d{2})\/(\d{4})/,
      /^(\d{2})\.(\d{2})\.(\d{4})/,
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2}|Z)?/,
      /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
    ];

    for (const regex of formats) {
      const match = dateStr.match(regex);
      if (match) {
        try {
          if (match[4] && match[5] && match[6]) {
            d = new Date(
              parseInt(match[1]),
              parseInt(match[2]) - 1,
              parseInt(match[3]),
              parseInt(match[4]),
              parseInt(match[5]),
              parseInt(match[6])
            );
          } else {
            d = new Date(
              parseInt(match[1]),
              parseInt(match[2]) - 1,
              parseInt(match[3])
            );
          }
          if (!isNaN(d.getTime())) return d;
        } catch {
          // 继续尝试其他格式
        }
      }
    }

    return null;
  }

  /**
   * 从 RDAP vcardArray 中提取组织名称
   */
  protected extractFromVcard(vcardArray: any[]): string | null {
    if (!Array.isArray(vcardArray) || vcardArray.length < 2) {
      return null;
    }

    const vcard = vcardArray[1];
    if (!Array.isArray(vcard)) {
      return null;
    }

    // 尝试提取 fn (full name)
    const fnEntry = vcard.find((v: any) => Array.isArray(v) && v[0] === 'fn');
    if (fnEntry && fnEntry[3]) {
      return fnEntry[3];
    }

    // 尝试提取 org
    const orgEntry = vcard.find((v: any) => Array.isArray(v) && v[0] === 'org');
    if (orgEntry && orgEntry[3]) {
      return orgEntry[3];
    }

    return null;
  }

  /**
   * 日志记录
   */
  protected log(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: Record<string, unknown>) {
    log[level]('WhoisQuery', `[${this.name}] ${message}`, meta);
  }
}
