/**
 * Domain Sync Detection Job Service
 * 域名同步检测定时任务 - 定期从 DNS 提供商拉取域名列表并对比数据库
 * 如果域名在提供商 API 中不存在，则自动禁用该域名
 */

import { DnsAccountOperations, DomainOperations, RenewableDomainOperations } from '../db/business-adapter';
import { createAdapter } from '../lib/dns/DnsHelper';
import { taskManager } from './taskManager';
import { logAuditOperation } from './audit';
import { log } from '../lib/logger';

let syncInterval: NodeJS.Timeout | null = null;

/**
 * 同步检测续期域名
 */
async function syncRenewableDomains(account: any, providerDomainSet: Set<string>): Promise<void> {
  const accountId = account.id;
  const accountName = account.name;
  
  try {
    // 获取该账户的所有续期域名
    const renewableDomains = await RenewableDomainOperations.getByAccountId(accountId);
    
    if (renewableDomains.length === 0) {
      return;
    }
    
    log.info('DomainSyncJob', `Checking ${renewableDomains.length} renewable domains for account: ${accountName}`);
    
    let disabledCount = 0;
    const disabledDomains: string[] = [];
    
    for (const renewableDomain of renewableDomains) {
      const domainName = (renewableDomain as any).full_domain?.toLowerCase() || 
                        (renewableDomain as any).domain_name?.toLowerCase();
      
      if (!domainName) {
        log.warn('DomainSyncJob', 'Renewable domain has no name, skipping', {
          id: (renewableDomain as any).id,
        });
        continue;
      }
      
      // 如果域名不在提供商列表中，且当前状态是启用，则禁用
      const isEnabled = Boolean((renewableDomain as any).enabled);
      if (!providerDomainSet.has(domainName) && isEnabled) {
        log.warn('DomainSyncJob', `Renewable domain not found in provider, disabling: ${domainName}`, {
          accountId,
          renewableDomainId: (renewableDomain as any).id,
        });
        
        // 禁用续期域名
        await RenewableDomainOperations.toggleEnabled((renewableDomain as any).id, false);
        
        // 记录审计日志（使用系统用户 ID 0）
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
            undefined // No request object for scheduled tasks
          );
        } catch (auditError) {
          log.error('DomainSyncJob', 'Failed to log audit operation for renewable domain', {
            domain: domainName,
            error: auditError,
          });
        }
        
        disabledCount++;
        disabledDomains.push(domainName);
      } else if (!providerDomainSet.has(domainName)) {
        // 域名不在提供商列表中，但已经是禁用状态，跳过
        log.debug('DomainSyncJob', `Renewable domain already disabled, skipping: ${domainName}`, {
          accountId,
          renewableDomainId: (renewableDomain as any).id,
        });
      }
    }
    
    if (disabledCount > 0) {
      log.info('DomainSyncJob', `Disabled ${disabledCount} renewable domains`, {
        accountId,
        accountName,
        disabledDomains,
      });
    }
  } catch (error) {
    log.error('DomainSyncJob', `Failed to sync renewable domains`, {
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
    log.info('DomainSyncJob', `Starting domain sync for account: ${accountName} (ID: ${accountId})`);
    
    // 解析配置
    const cfg = typeof account.config === 'string' 
      ? JSON.parse(account.config) as Record<string, string> 
      : account.config as Record<string, string>;
    
    // 创建适配器
    const dnsAdapter = createAdapter(account.type, cfg);
    
    // 分页获取所有域名
    const providerDomains: Array<{ Domain: string; ThirdId: string }> = [];
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
          log.error('DomainSyncJob', `API timeout or 404, skipping sync for this account`, {
            accountId,
            page,
            error: errorMsg,
          });
          apiError = true;
          hasMore = false;
          break;
        }
        
        log.error('DomainSyncJob', `Failed to fetch domains page ${page}`, {
          accountId,
          page,
          error: errorMsg,
        });
        hasMore = false;
      }
    }
    
    // If API failed, skip the sync to avoid disabling domains incorrectly
    if (apiError) {
      log.warn('DomainSyncJob', `Skipping domain sync due to API error`, {
        accountId,
        accountName,
      });
      return;
    }
    
    log.info('DomainSyncJob', `Fetched ${providerDomains.length} domains from provider`, {
      accountId,
      accountName,
    });
    
    // 获取数据库中该账户的所有域名
    const dbDomains = await DomainOperations.getByAccountId(accountId);
    
    // 创建提供商域名集合（用于快速查找）
    const providerDomainSet = new Set(
      providerDomains.map(d => d.Domain.toLowerCase())
    );
    
    // 检查数据库中的域名是否在提供商列表中
    let disabledCount = 0;
    const disabledDomains: string[] = [];
    
    for (const dbDomain of dbDomains) {
      const domainName = (dbDomain as any).name.toLowerCase();
      
      // 如果域名不在提供商列表中，且当前状态是启用，则禁用
      const isEnabled = Boolean((dbDomain as any).enabled);
      if (!providerDomainSet.has(domainName) && isEnabled) {
        log.warn('DomainSyncJob', `Domain not found in provider, disabling: ${(dbDomain as any).name}`, {
          accountId,
          domainId: (dbDomain as any).id,
        });
        
        // 禁用域名
        await DomainOperations.update((dbDomain as any).id, { enabled: false });
        
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
          log.error('DomainSyncJob', 'Failed to log audit operation', {
            domain: (dbDomain as any).name,
            error: auditError,
          });
        }
        
        disabledCount++;
        disabledDomains.push((dbDomain as any).name);
      } else if (!providerDomainSet.has(domainName)) {
        // 域名不在提供商列表中，但已经是禁用状态，跳过
        log.debug('DomainSyncJob', `Domain already disabled, skipping: ${(dbDomain as any).name}`, {
          accountId,
          domainId: (dbDomain as any).id,
        });
      }
    }
    
    if (disabledCount > 0) {
      log.info('DomainSyncJob', `Disabled ${disabledCount} domains`, {
        accountId,
        accountName,
        disabledDomains,
      });
    } else {
      log.info('DomainSyncJob', 'All domains are synchronized', {
        accountId,
        accountName,
      });
    }
    
    // Sync renewable_domains table
    await syncRenewableDomains(account, providerDomainSet);
  } catch (error) {
    log.error('DomainSyncJob', `Failed to sync account domains`, {
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
    log.info('DomainSyncJob', 'Starting domain synchronization detection');
    
    // 获取所有启用的 DNS 账户
    const accounts = await DnsAccountOperations.getAll() as any[];
    const activeAccounts = accounts.filter((acc: any) => acc.enabled !== false);
    
    if (activeAccounts.length === 0) {
      log.info('DomainSyncJob', 'No active DNS accounts found, skipping sync');
      return;
    }
    
    log.info('DomainSyncJob', `Found ${activeAccounts.length} active accounts to sync`);
    
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
    
    log.info('DomainSyncJob', 'Domain synchronization completed');
  } catch (error) {
    log.error('DomainSyncJob', 'Domain synchronization failed', {
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
    log.warn('DomainSyncJob', 'Domain sync job already started');
    return;
  }
  
  const intervalMs = intervalHours * 60 * 60 * 1000;
  
  log.info('DomainSyncJob', `Starting domain sync job scheduler (interval: ${intervalHours} hours)`);
  
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
    ).catch(err => log.error('DomainSyncJob', 'Initial sync error:', { error: err }));
    
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
      ).catch(err => log.error('DomainSyncJob', 'Scheduled sync error:', { error: err }));
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
    log.info('DomainSyncJob', 'Domain sync job stopped');
  }
}
