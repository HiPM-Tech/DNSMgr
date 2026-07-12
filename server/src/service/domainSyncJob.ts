/**
 * Domain Sync Detection Job Service
 * 域名同步检测定时任务 - 定期从 DNS 提供商拉取域名列表并对比数据库
 * 如果域名在提供商 API 中不存在，则自动禁用该域名
 */

import { DnsAccountOperations, DomainOperations, RenewableDomainOperations } from '../db/bal/business-adapter';
import { createAdapter } from '../lib/dns/DnsHelper';
import { taskManager } from './taskManager';
import { logAuditOperation } from './audit';
import { createLogger } from '../lib/logger';
import { normalizeDomain } from '../utils/dns';

const log = createLogger('Job').sub('DomainSync');
let syncInterval: NodeJS.Timeout | null = null;

/**
 * 同步检测续期域名
 */
async function syncRenewableDomains(
  account: any,
  providerDomainSet: Set<string>,
  providerDomainExpiryMap: Map<string, string>,
): Promise<void> {
  const accountId = account.id;
  const accountName = account.name;

  try {
    // 获取该账户的所有续期域名
    const renewableDomains = await RenewableDomainOperations.getByAccountId(accountId);

    if (renewableDomains.length === 0) {
      return;
    }

    log.info(`Checking ${renewableDomains.length} renewable domains for account: ${accountName}`);

    let disabledCount = 0;
    let updatedExpiryCount = 0;
    const disabledDomains: string[] = [];

    for (const renewableDomain of renewableDomains) {
      // 使用 normalizeDomain 标准化续期域名，支持 IDN 域名
      const rawDomainName = (renewableDomain as any).full_domain || (renewableDomain as any).domain_name;
      const domainName = rawDomainName ? normalizeDomain(rawDomainName) : '';

      if (!domainName) {
        log.warn('Renewable domain has no name, skipping', {
          id: (renewableDomain as any).id,
        });
        continue;
      }

      const isEnabled = Boolean((renewableDomain as any).enabled);

      if (providerDomainSet.has(domainName)) {
        // 域名存在于提供商列表中 — 同步到期时间
        const providerExpiry = providerDomainExpiryMap.get(domainName);
        const localExpiry = (renewableDomain as any).expires_at;
        if (providerExpiry && providerExpiry !== localExpiry) {
          await RenewableDomainOperations.updateExpiresAt((renewableDomain as any).id, providerExpiry);
          updatedExpiryCount++;
          log.debug(`Updated expires_at for renewable domain: ${domainName}`, {
            from: localExpiry,
            to: providerExpiry,
          });
        }
      } else if (isEnabled) {
        // 域名不在提供商列表中，且当前状态是启用，则禁用
        log.warn(`Renewable domain not found in provider, disabling: ${domainName}`, {
          accountId,
          renewableDomainId: (renewableDomain as any).id,
        });

        await RenewableDomainOperations.toggleEnabled((renewableDomain as any).id, false);

        try {
          await logAuditOperation(
            0, // System user
            'auto_disable_renewable_domain',
            domainName,
            {
              accountId,
              accountName,
              reason: 'Renewable domain not found in provider API',
              thirdId: (renewableDomain as any).third_id,
            },
            undefined
          );
        } catch (auditError) {
          log.error('Failed to log audit operation for renewable domain', {
            domain: domainName,
            error: auditError,
          });
        }

        disabledCount++;
        disabledDomains.push(domainName);
      } else {
        log.debug(`Renewable domain already disabled, skipping: ${domainName}`, {
          accountId,
          renewableDomainId: (renewableDomain as any).id,
        });
      }
    }

    if (updatedExpiryCount > 0) {
      log.info(`Updated expires_at for ${updatedExpiryCount} renewable domains`, { accountId, accountName });
    }
    if (disabledCount > 0) {
      log.info(`Disabled ${disabledCount} renewable domains`, {
        accountId,
        accountName,
        disabledDomains,
      });
    }
  } catch (error) {
    log.error(`Failed to sync renewable domains`, {
      accountId,
      accountName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 同步检测单个账户的域名
 */
async function syncAccountDomains(account: any): Promise<void> {
  const accountId = account.id;
  const accountName = account.name;

  try {
    //#region debug-point mem-leak-sync-account-entry
    const mEntry = process.memoryUsage();
    log.tag('MEM-LEAK-DEBUG').info('syncAccountDomains entry', {
      accountId, accountName,
      rssMB: +(mEntry.rss / 1024 / 1024).toFixed(1),
      heapUsedMB: +(mEntry.heapUsed / 1024 / 1024).toFixed(1),
    });
    //#endregion
    log.info(`Starting domain sync for account: ${accountName} (ID: ${accountId})`);

    // 解析配置
    const cfg = typeof account.config === 'string'
      ? JSON.parse(account.config) as Record<string, string>
      : account.config as Record<string, string>;

    // 创建适配器
    const dnsAdapter = createAdapter(account.type, cfg);

    // 分页获取所有域名
    const providerDomains: Array<{ Domain: string; ThirdId: string; ExpiresAt?: string }> = [];
    let page = 1;
    const pageSize = 50;
    let hasMore = true;
    let apiError = false;

    while (hasMore) {
      try {
        const result = await dnsAdapter.getDomainList(undefined, page, pageSize);

        if (!result.list || result.list.length === 0) {
          hasMore = false;
          break;
        }

        // 适配不同提供商的返回格式
        result.list.forEach((domain: any) => {
          providerDomains.push({
            Domain: domain.Domain || domain.domain || domain.name,
            ThirdId: domain.ThirdId || domain.third_id || domain.id,
            ExpiresAt: domain.ExpiresAt || domain.expires_at || domain.expiry_date || undefined,
          });
        });

        // 检查是否还有更多页面
        if (result.list.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }

        // 避免请求过快
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        // Check for timeout or 404 errors
        if (errorMsg.includes('timeout') ||
            errorMsg.includes('ETIMEDOUT') ||
            errorMsg.includes('404') ||
            errorMsg.includes('Not Found')) {
          log.error(`API timeout or 404, skipping sync for this account`, {
            accountId,
            page,
            error: errorMsg,
          });
          apiError = true;
          hasMore = false;
          break;
        }

        log.error(`Failed to fetch domains page ${page}`, {
          accountId,
          page,
          error: errorMsg,
        });
        hasMore = false;
      }
    }

    // If API failed, skip the sync to avoid disabling domains incorrectly
    if (apiError) {
      log.warn(`Skipping domain sync due to API error`, {
        accountId,
        accountName,
      });
      return;
    }

    // 安全网：提供商返回 0 个域名但数据库有域名时，检查适配器错误状态
    if (providerDomains.length === 0) {
      const adapterError = dnsAdapter.getError?.();
      if (adapterError) {
        log.warn(`Provider returned empty domain list but adapter has error, skipping sync`, {
          accountId, accountName, adapterError,
        });
        return;
      }
    }

    log.info(`Fetched ${providerDomains.length} domains from provider`, {
      accountId,
      accountName,
    });

    //#region debug-point mem-leak-sync-provider-loaded
    const mProvider = process.memoryUsage();
    log.tag('MEM-LEAK-DEBUG').info('providerDomains loaded', {
      accountId, accountName,
      providerDomainsCount: providerDomains.length,
      rssMB: +(mProvider.rss / 1024 / 1024).toFixed(1),
      heapUsedMB: +(mProvider.heapUsed / 1024 / 1024).toFixed(1),
    });
    //#endregion

    // 获取数据库中该账户的所有域名
    const dbDomains = await DomainOperations.getByAccountId(accountId);

    //#region debug-point mem-leak-sync-dbdomain-loaded
    const mDb = process.memoryUsage();
    log.tag('MEM-LEAK-DEBUG').info('dbDomains loaded', {
      accountId, accountName,
      dbDomainsCount: dbDomains.length,
      rssMB: +(mDb.rss / 1024 / 1024).toFixed(1),
      heapUsedMB: +(mDb.heapUsed / 1024 / 1024).toFixed(1),
    });
    //#endregion

    // 创建提供商域名集合（用于快速查找）
    // 使用 normalizeDomain 将域名标准化为 Punycode，支持 IDN 域名
    const providerDomainSet = new Set(
      providerDomains.map(d => normalizeDomain(d.Domain))
    );

    // 创建提供商域名到期时间映射（用于同步续期域名到期时间）
    const providerDomainExpiryMap = new Map<string, string>();
    for (const d of providerDomains) {
      if (d.ExpiresAt) {
        providerDomainExpiryMap.set(normalizeDomain(d.Domain), d.ExpiresAt);
      }
    }

    // 检查数据库中的域名是否在提供商列表中
    let disabledCount = 0;
    const disabledDomains: string[] = [];

    for (const dbDomain of dbDomains) {
      // 使用 normalizeDomain 标准化数据库中的域名（已经是 Punycode，但确保一致性）
      const domainName = normalizeDomain((dbDomain as any).name);

      // 如果域名不在提供商列表中，且当前状态是启用，则禁用
      const isEnabled = Boolean((dbDomain as any).enabled);
      if (!providerDomainSet.has(domainName) && isEnabled) {
        log.warn(`Domain not found in provider, disabling: ${(dbDomain as any).name}`, {
          accountId,
          domainId: (dbDomain as any).id,
        });

        // 禁用域名
        await DomainOperations.update((dbDomain as any).id, { enabled: 0 });

        // 记录审计日志（使用系统用户 ID 0）
        try {
          await logAuditOperation(
            0, // System user
            'auto_disable_domain',
            (dbDomain as any).name,
            {
              accountId,
              accountName,
              reason: 'Domain not found in provider API',
              thirdId: (dbDomain as any).third_id,
            },
            undefined // No request object for scheduled tasks
          );
        } catch (auditError) {
          log.error('Failed to log audit operation', {
            domain: (dbDomain as any).name,
            error: auditError,
          });
        }

        disabledCount++;
        disabledDomains.push((dbDomain as any).name);
      } else if (!providerDomainSet.has(domainName)) {
        // 域名不在提供商列表中，但已经是禁用状态，跳过
        log.debug(`Domain already disabled, skipping: ${(dbDomain as any).name}`, {
          accountId,
          domainId: (dbDomain as any).id,
        });
      }
    }

    if (disabledCount > 0) {
      log.info(`Disabled ${disabledCount} domains`, {
        accountId,
        accountName,
        disabledDomains,
      });
    } else {
      log.info('All domains are synchronized', {
        accountId,
        accountName,
      });
    }

    // Sync renewable_domains table
    await syncRenewableDomains(account, providerDomainSet, providerDomainExpiryMap);

    //#region debug-point mem-leak-sync-account-done
    const mDone = process.memoryUsage();
    log.tag('MEM-LEAK-DEBUG').info('syncAccountDomains done', {
      accountId, accountName,
      rssMB: +(mDone.rss / 1024 / 1024).toFixed(1),
      heapUsedMB: +(mDone.heapUsed / 1024 / 1024).toFixed(1),
    });
    //#endregion
  } catch (error) {
    log.error(`Failed to sync account domains`, {
      accountId,
      accountName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 执行域名同步检测
 */
export async function executeDomainSync(): Promise<void> {
  try {
    //#region debug-point mem-leak-sync-entry
    const m0 = process.memoryUsage();
    log.tag('MEM-LEAK-DEBUG').info('executeDomainSync entry', {
      rssMB: +(m0.rss / 1024 / 1024).toFixed(1),
      heapUsedMB: +(m0.heapUsed / 1024 / 1024).toFixed(1),
      heapTotalMB: +(m0.heapTotal / 1024 / 1024).toFixed(1),
    });
    //#endregion
    log.info('Starting domain synchronization detection');

    // 获取所有启用的 DNS 账户
    const accounts = await DnsAccountOperations.getAll() as any[];
    const activeAccounts = accounts.filter((acc: any) => acc.enabled !== false);

    if (activeAccounts.length === 0) {
      log.info('No active DNS accounts found, skipping sync');
      return;
    }

    //#region debug-point mem-leak-sync-accounts
    const m1 = process.memoryUsage();
    log.tag('MEM-LEAK-DEBUG').info('DnsAccountOperations.getAll loaded', {
      accountCount: accounts.length,
      activeCount: activeAccounts.length,
      rssMB: +(m1.rss / 1024 / 1024).toFixed(1),
      heapUsedMB: +(m1.heapUsed / 1024 / 1024).toFixed(1),
    });
    //#endregion
    log.info(`Found ${activeAccounts.length} active accounts to sync`);

    // 使用任务管理器并发处理（最多同时3个账户）
    const tasks = activeAccounts.map(account => {
      return taskManager.submit(
        {
          id: `domain-sync-${account.id}`,
          name: `Domain Sync: ${account.name}`,
          concurrency: 3, // 允许最多3个账户并发
          timeout: 300000, // 5分钟超时
          retries: 1, // 失败重试1次
          retryDelay: 10000, // 重试间隔10秒
        },
        async () => {
          await syncAccountDomains(account);
        }
      );
    });

    // 等待所有任务完成
    await Promise.all(tasks);

    //#region debug-point mem-leak-sync-done
    const mEnd = process.memoryUsage();
    log.tag('MEM-LEAK-DEBUG').info('executeDomainSync done', {
      rssMB: +(mEnd.rss / 1024 / 1024).toFixed(1),
      heapUsedMB: +(mEnd.heapUsed / 1024 / 1024).toFixed(1),
      heapTotalMB: +(mEnd.heapTotal / 1024 / 1024).toFixed(1),
    });
    //#endregion
    log.info('Domain synchronization completed');
  } catch (error) {
    log.error('Domain synchronization failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 启动域名同步检测定时任务
 * @param intervalHours 检测间隔（小时），默认 6 小时
 */
export function startDomainSyncJob(intervalHours: number = 6): void {
  if (syncInterval) {
    log.warn('Domain sync job already started');
    return;
  }

  const intervalMs = intervalHours * 60 * 60 * 1000;

  log.info(`Starting domain sync job scheduler (interval: ${intervalHours} hours)`);

  // 启动后 2 分钟运行第一次（给系统一些启动时间）
  setTimeout(() => {
    taskManager.submit(
      {
        id: 'domain-sync-initial',
        name: 'Domain Sync Initial',
        concurrency: 1, // 串行执行
        timeout: 600000, // 10分钟超时
        retries: 1,
        retryDelay: 30000,
      },
      executeDomainSync
    ).catch(err => log.error('Initial sync error:', { error: err }));

    // 之后按设定的间隔执行
    syncInterval = setInterval(() => {
      taskManager.submit(
        {
          id: `domain-sync-${Date.now()}`,
          name: 'Domain Sync Scheduled',
          concurrency: 1, // 串行执行
          timeout: 600000, // 10分钟超时
          retries: 1,
          retryDelay: 30000,
        },
        executeDomainSync
      ).catch(err => log.error('Scheduled sync error:', { error: err }));
    }, intervalMs);
  }, 2 * 60 * 1000);
}

/**
 * 停止域名同步检测定时任务
 */
export function stopDomainSyncJob(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    log.info('Domain sync job stopped');
  }
}
