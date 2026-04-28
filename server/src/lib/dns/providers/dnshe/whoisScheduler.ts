/**
 * DNSHE WHOIS 查询调度器实现
 */

import { WhoisScheduler, WhoisResult } from '../../../../service/whoisScheduler';
import { getWhois } from './whois';
import { DnsheAuthConfig } from './auth';
import { log } from '../internal';

export class DnsheWhoisScheduler implements WhoisScheduler {
  readonly type = 'dnshe';

  /**
   * 查询 DNSHE 域名的 WHOIS 信息
   */
  async queryWhois(config: DnsheAuthConfig, domain: string): Promise<WhoisResult | null> {
    try {
      const result = await getWhois(config, domain);
      
      if (!result || !result.success) {
        log.warn('DnsheWhoisScheduler', 'WHOIS query failed', { domain });
        return null;
      }

      // 转换为统一格式
      return {
        success: true,
        domain: result.domain || domain,
        registrar: result.registrar,
        registrant: result.registrant,
        creation_date: result.creation_date,
        expiration_date: result.expiration_date,
        updated_date: result.updated_date,
        name_servers: result.name_servers,
        status: result.status,
        dnssec: result.dnssec,
        raw_data: result.raw_data,
        ...result,
      };
    } catch (error) {
      log.error('DnsheWhoisScheduler', 'Error querying WHOIS', {
        domain,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

// 创建并导出单例实例
export const dnsheWhoisScheduler = new DnsheWhoisScheduler();
