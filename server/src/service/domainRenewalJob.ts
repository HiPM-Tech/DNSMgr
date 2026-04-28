/**
 * Domain Renewal Job Service
 * 域名续期定时任务服务 - 每天 UTC 0:00 自动续期 DNSHE 域名
 */

import { DnsAccountOperations } from '../db/business-adapter';
import { renewalRegistry } from './renewalScheduler';
import { logAuditOperation } from './audit';
import { log } from '../lib/logger';

let renewalInterval: NodeJS.Timeout | null = null;

/**
 * 执行域名自动续期
 */
export async function executeDomainRenewal(): Promise<void> {
  try {
    log.info('DomainRenewalJob', 'Starting automatic domain renewal');

    // 获取所有 DNSHE 账号
    const accounts = await DnsAccountOperations.getAll() as any[];
    const dnsheAccounts = accounts.filter((acc: any) => acc.type === 'dnshe');

    if (dnsheAccounts.length === 0) {
      log.info('DomainRenewalJob', 'No DNSHE accounts found, skipping renewal');
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
          log.warn('DomainRenewalJob', 'No renewal scheduler registered for provider type', {
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
        
        log.info('DomainRenewalJob', 'Fetched renewable domains via scheduler', {
          accountId: account.id,
          accountName: account.name,
          type: account.type,
          count: renewableDomains.length,
        });
        
        // 过滤出需要续期的域名（即将到期或已过期）
        const now = new Date();
        const domainsToRenew = renewableDomains.filter((d: any) => {
          if (!d.expires_at) return false;
          
          const expiryDate = new Date(d.expires_at);
          const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          // 续期条件：剩余天数 <= 30 天或已过期
          return daysLeft <= 30;
        });

        // 对每个需要续期的域名执行续期
        for (const domain of domainsToRenew) {
          try {
            const domainId = domain.id;
            if (!domainId) {
              log.warn('DomainRenewalJob', 'Domain has no id, skipping', {
                domainName: domain.name || domain.full_domain,
              });
              continue;
            }

            log.info('DomainRenewalJob', 'Renewing domain via scheduler', {
              domainName: domain.name || domain.full_domain,
              domainId,
              expiresAt: domain.expires_at,
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
              log.info('DomainRenewalJob', 'Domain renewed successfully', {
                domainName: result.domain_name,
                previousExpiresAt: result.previous_expires_at,
                newExpiresAt: result.new_expires_at,
                remainingDays: result.remaining_days,
              });

              // 记录审计日志
              try {
                await logAuditOperation(
                  0, // system user
                  'renew_domain',
                  result.domain_name,
                  {
                    domain_id: result.domain_id,
                    previous_expires_at: result.previous_expires_at,
                    new_expires_at: result.new_expires_at,
                    remaining_days: result.remaining_days,
                    auto_renewal: true,
                  }
                );
              } catch (auditError) {
                log.error('DomainRenewalJob', 'Failed to log audit', { 
                  domainName: result.domain_name, 
                  error: auditError 
                });
              }
            } else {
              failedCount++;
              log.error('DomainRenewalJob', 'Domain renewal failed', {
                domainName: domain.name || domain.full_domain,
                domainId,
              });
            }
          } catch (error) {
            failedCount++;
            log.error('DomainRenewalJob', 'Domain renewal error', {
              domainName: domain.name || domain.full_domain,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } catch (error) {
        log.error('DomainRenewalJob', 'Failed to process account', {
          accountId: account.id,
          accountName: account.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    log.info('DomainRenewalJob', 'Automatic domain renewal completed', {
      renewedCount,
      failedCount,
      totalAccounts: dnsheAccounts.length,
    });
  } catch (error) {
    log.error('DomainRenewalJob', 'Automatic domain renewal failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 启动域名续期定时任务
 * 每天 UTC 0:00 执行
 */
export function startDomainRenewalJob(): void {
  if (renewalInterval) {
    log.warn('DomainRenewalJob', 'Renewal job already running');
    return;
  }

  // 计算到下一个 UTC 0:00 的时间
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setUTCHours(24, 0, 0, 0); // 明天 UTC 0:00
  
  const initialDelay = nextRun.getTime() - now.getTime();
  
  log.info('DomainRenewalJob', 'Starting domain renewal job', {
    nextRun: nextRun.toISOString(),
    initialDelayMs: initialDelay,
    initialDelayHours: Math.round(initialDelay / (1000 * 60 * 60) * 100) / 100,
  });

  // 首次执行（在下一个 UTC 0:00）
  renewalInterval = setTimeout(() => {
    executeDomainRenewal();
    
    // 之后每 24 小时执行一次
    renewalInterval = setInterval(executeDomainRenewal, 24 * 60 * 60 * 1000);
  }, initialDelay);
}

/**
 * 停止域名续期定时任务
 */
export function stopDomainRenewalJob(): void {
  if (renewalInterval) {
    clearInterval(renewalInterval);
    renewalInterval = null;
    log.info('DomainRenewalJob', 'Domain renewal job stopped');
  }
}
