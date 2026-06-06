/**
 * Domain Renewal Job Service
 * 域名续期定时任务服务 - 每天 UTC 0:00 自动续期 DNSHE 域名
 */

import { DnsAccountOperations, RenewableDomainOperations } from '../db/bal/business-adapter';
import { renewalRegistry } from './renewalScheduler';
import { taskManager } from './taskManager';
import { logAuditOperation } from './audit';
import { createLogger } from '../lib/logger';

const log = createLogger('Job').sub('DomainRenewal');
let renewalInterval: NodeJS.Timeout | null = null;

/**
 * 执行域名自动续期
 */
export async function executeDomainRenewal(): Promise<void> {
  try {
    log.info('Starting automatic domain renewal');

    // 获取所有 DNSHE 账号
    const accounts = await DnsAccountOperations.getAll() as any[];
    const dnsheAccounts = accounts.filter((acc: any) => acc.type === 'dnshe');

    if (dnsheAccounts.length === 0) {
      log.info('No DNSHE accounts found, skipping renewal');
      return;
    }

    let renewedCount = 0;
    let failedCount = 0;

    // 遍历每个 DNSHE 账号
    for (const account of dnsheAccounts) {
      try {
        const config = typeof account.config === 'string' ? JSON.parse(account.config) : account.config;

        // 获取该提供商类型的续期调度器
        const scheduler = renewalRegistry.getScheduler(account.type);

        if (!scheduler) {
          log.warn('No renewal scheduler registered for provider type', {
            accountId: account.id,
            accountName: account.name,
            type: account.type,
          });
          continue;
        }

        // 通过调度器获取可续期的域名列表
        const renewableDomains = await scheduler.listRenewableDomains({
          apiKey: config.apiKey,
          apiSecret: config.apiSecret,
          useProxy: !!config.useProxy,
        });

        log.info('Fetched renewable domains via scheduler', {
          accountId: account.id,
          accountName: account.name,
          type: account.type,
          count: renewableDomains.length,
        });

        // 注意：DNSHE listSubdomains API 不返回 expires_at
        // 所以我们对所有子域名尝试续期，让 API 自己判断是否需要续期
        const domainsToRenew = renewableDomains;

        // 对每个需要续期的域名执行续期
        for (const domain of domainsToRenew) {
          try {
            const domainId = domain.id;
            if (!domainId) {
              log.warn('Domain has no id, skipping', {
                domainName: domain.name || domain.full_domain,
              });
              continue;
            }

            // Check if domain is enabled in database
            const dbDomain = await RenewableDomainOperations.getById(Number(domainId));
            if (!dbDomain) {
              log.warn('Domain not found in database, skipping', {
                domainId,
                domainName: domain.name || domain.full_domain,
              });
              continue;
            }

            if (!dbDomain.enabled) {
              log.info('Skipping disabled domain', {
                domainId,
                domainName: dbDomain.full_domain,
                enabled: dbDomain.enabled,
              });
              continue;
            }

            log.info('Attempting domain renewal via scheduler', {
              domainName: domain.name || domain.full_domain,
              domainId,
              // Note: expires_at is not available from listSubdomains API
              // The renewSubdomain API will handle expiry check server-side
            });

            const result = await scheduler.renewDomain(
              {
                apiKey: config.apiKey,
                apiSecret: config.apiSecret,
                useProxy: !!config.useProxy,
              },
              domainId
            );

            if (result) {
              renewedCount++;
              log.info('Domain renewed successfully', {
                domainName: result.domain_name,
                previousExpiresAt: result.previous_expires_at,
                newExpiresAt: result.new_expires_at,
                remainingDays: result.remaining_days,
              });

              // ✅ 1. 更新 renewable_domains 表中的 expires_at（续期的职责）
              if (result.new_expires_at) {
                try {
                  await RenewableDomainOperations.updateExpiresAt(Number(domainId), result.new_expires_at);
                  log.debug('Updated expires_at in renewable_domains', {
                    domainId,
                    newExpiresAt: result.new_expires_at,
                  });
                } catch (updateError) {
                  log.error('Failed to update expires_at in renewable_domains', {
                    domainId,
                    error: updateError instanceof Error ? updateError.message : String(updateError),
                  });
                }
              }
            } else {
              failedCount++;
              log.error('Domain renewal failed', {
                domainName: domain.name || domain.full_domain,
                domainId,
              });
            }
          } catch (error) {
            failedCount++;
            log.error('Domain renewal error', {
              domainName: domain.name || domain.full_domain,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } catch (error) {
        log.error('Failed to process account', {
          accountId: account.id,
          accountName: account.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    log.info('Automatic domain renewal completed', {
      renewedCount,
      failedCount,
      totalAccounts: dnsheAccounts.length,
    });
  } catch (error) {
    log.error('Automatic domain renewal failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 启动域名续期定时任务
 * 每天 UTC 0:00 执行
 */
export async function startDomainRenewalJob(): Promise<void> {
  // 计算到下一个 UTC 0:00 的时间
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setUTCHours(24, 0, 0, 0); // 明天 UTC 0:00

  const initialDelay = nextRun.getTime() - now.getTime();

  log.info('Starting domain renewal job', {
    nextRun: nextRun.toISOString(),
    initialDelayMs: initialDelay,
    initialDelayHours: Math.round(initialDelay / (1000 * 60 * 60) * 100) / 100,
  });

  // 首次执行（在下一个 UTC 0:00）
  setTimeout(() => {
    taskManager.submit(
      {
        id: 'domain-renewal-initial',
        name: 'Domain Renewal Initial',
        concurrency: 1,       // 串行执行，避免并发续期
        timeout: 300000,      // 5分钟超时
        retries: 1,           // 失败重试1次
        retryDelay: 60000,    // 重试间隔1分钟
      },
      executeDomainRenewal
    ).catch(err => log.error('Initial renewal error:', { error: err }));

    // 之后每 24 小时执行一次
    setInterval(() => {
      taskManager.submit(
        {
          id: `domain-renewal-${Date.now()}`,
          name: 'Domain Renewal Scheduled',
          concurrency: 1,       // 串行执行
          timeout: 300000,      // 5分钟超时
          retries: 1,           // 失败重试1次
          retryDelay: 60000,    // 重试间隔1分钟
        },
        executeDomainRenewal
      ).catch(err => log.error('Scheduled renewal error:', { error: err }));
    }, 24 * 60 * 60 * 1000);
  }, initialDelay);
}

/**
 * 停止域名续期定时任务
 */
export function stopDomainRenewalJob(): void {
  if (renewalInterval) {
    clearInterval(renewalInterval);
    renewalInterval = null;
    log.info('Domain renewal job stopped');
  }
}
