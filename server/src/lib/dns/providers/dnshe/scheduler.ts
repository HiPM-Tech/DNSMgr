import { createProviderRenewalLogger } from '../internal';
/**
 * DNSHE 域名续期调度器实现
 */

import { RenewalScheduler, RenewableDomain, RenewalResult } from '../../../../service/renewalScheduler';
import { listSubdomains, renewSubdomain, DnsheAuthConfig } from './index';

const log = createProviderRenewalLogger('DNSHE');
export class DnsheRenewalScheduler implements RenewalScheduler {
  readonly type = 'dnshe';

  /**
   * 获取 DNSHE 账号下所有可续期的域名
   * 注意：listSubdomains API 不返回 expires_at，所以返回所有子域名
   * 实际续期时会通过 renewSubdomain API 获取到期时间
   */
  async listRenewableDomains(config: DnsheAuthConfig): Promise<RenewableDomain[]> {
    try {
      const result = await listSubdomains(config);

      if (!result || !result.success || !result.subdomains) {
        log.warn('Failed to list subdomains');
        return [];
      }

      // 转换为统一格式（不包含 expires_at，因为 API 不返回）
      return result.subdomains.map((sub: any) => ({
        id: sub.id,
        name: sub.full_domain,
        full_domain: sub.full_domain,
        status: sub.status,
        // expires_at 将在续期时通过 renewSubdomain API 获取
      }));
    } catch (error) {
      log.error('Error listing renewable domains', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * 续期指定域名
   */
  async renewDomain(config: DnsheAuthConfig, domainId: number | string): Promise<RenewalResult> {
    const result = await renewSubdomain(config, Number(domainId));
    return {
      success: true,
      domain_id: result.subdomain_id,
      domain_name: result.subdomain,
      previous_expires_at: result.previous_expires_at,
      new_expires_at: result.new_expires_at,
      remaining_days: result.remaining_days,
      message: result.message,
    };
  }
}

// 创建并导出单例实例
export const dnsheRenewalScheduler = new DnsheRenewalScheduler();
