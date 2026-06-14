/**
 * ⚠️ DigitalPlat Domains (dpdns) 域名续期调度器 — 逆向实现
 *
 * 实现 RenewalScheduler 接口，供续期定时任务调用。
 * 使用 remember_token 认证（逆向 web 控制台 API）。
 * 仅处理 free 配额的域名，每次续期 1 年。
 *
 * ⚠️ 注意：未来将添加 dodns 提供商（官方 API key 实现），
 *    dodns 会注册另一个 RenewalScheduler 实例。
 */

import { createProviderRenewalLogger } from '../internal';
import { RenewalScheduler, RenewableDomain, RenewalResult } from '../../../../service/renewalScheduler';
import { listFreeDomains, renewFreeDomain, parseDpdnsDate, DpdnsAuthConfig } from './index';

const log = createProviderRenewalLogger('DPDNS');

export class DpdnsReverseRenewalScheduler implements RenewalScheduler {
  readonly type = 'dpdns_reverse';

  /**
   * 获取 dpdns 账号下所有 free 配额的域名
   *
   * 过滤条件：
   *   - slot_type === 'free'
   *   - can_manual_renew === true
   */
  async listRenewableDomains(config: DpdnsAuthConfig): Promise<RenewableDomain[]> {
    try {
      const domains = await listFreeDomains(config);

      return domains
        .map((d) => ({
          id: d.domain,                        // 使用域名本身作为 ID
          name: d.domain.split('.')[0],        // 子域名部分
          full_domain: d.domain,
          expires_at: parseDpdnsDate(d.expiry_date),
          status: d.status,
        }));
    } catch (error) {
      log.error('Error listing free domains', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * 续期指定域名（free 续期 1 年）
   *
   * @param config   认证配置
   * @param domainId 域名完整名称（如 example.dpdns.org）
   */
  async renewDomain(config: DpdnsAuthConfig, domainId: number | string): Promise<RenewalResult | null> {
    const domainName = String(domainId);
    try {
      const result = await renewFreeDomain(config, domainName, 1);

      if (!result) {
        log.error('Renewal failed', { domain: domainName });
        return null;
      }

      return {
        success: true,
        domain_id: domainName,
        domain_name: domainName,
        new_expires_at: result.newExpiryDate,
        message: 'Domain renewed via dpdns free renewal',
      };
    } catch (error) {
      log.error('Error renewing domain', {
        domain: domainName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

/** 单例实例 */
export const dpdnsReverseRenewalScheduler = new DpdnsReverseRenewalScheduler();