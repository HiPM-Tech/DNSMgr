/**
 * DNSHE 域名续期调度器实现
 */

import { RenewalScheduler, RenewableDomain, RenewalResult } from '../../../../service/renewalScheduler';
import { listSubdomains, renewSubdomain } from './renewal';
import { DnsheAuthConfig } from './auth';
import { log } from '../../../logger';

export class DnsheRenewalScheduler implements RenewalScheduler {
  readonly type = 'dnshe';

  /**
   * 获取 DNSHE 账号下所有可续期的域名
   */
  async listRenewableDomains(config: DnsheAuthConfig): Promise<RenewableDomain[]> {
    try {
      const result = await listSubdomains(config);
      
      if (!result || !result.success || !result.subdomains) {
        log.warn('DnsheRenewalScheduler', 'Failed to list subdomains');
        return [];
      }

      // 转换为统一格式
      return result.subdomains.map((sub: any) => ({
        id: sub.id,
        name: sub.full_domain,
        full_domain: sub.full_domain,
        expires_at: sub.expires_at,
        status: sub.status,
      }));
    } catch (error) {
      log.error('DnsheRenewalScheduler', 'Error listing renewable domains', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * 续期指定域名
   */
  async renewDomain(config: DnsheAuthConfig, domainId: number | string): Promise<RenewalResult | null> {
    try {
      const result = await renewSubdomain(config, Number(domainId));
      
      if (!result) {
        log.error('DnsheRenewalScheduler', 'Renewal failed', { domainId });
        return null;
      }

      return {
        success: true,
        domain_id: result.subdomain_id,
        domain_name: result.subdomain,
        previous_expires_at: result.previous_expires_at,
        new_expires_at: result.new_expires_at,
        remaining_days: result.remaining_days,
        message: result.message,
        ...result,
      };
    } catch (error) {
      log.error('DnsheRenewalScheduler', 'Error renewing domain', {
        domainId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

// 创建并导出单例实例
export const dnsheRenewalScheduler = new DnsheRenewalScheduler();
