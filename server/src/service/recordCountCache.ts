import { createLogger } from '../lib/logger';
import { DomainOperations, DnsAccountOperations } from '../db/bal/business-adapter';
import { taskManager } from './taskManager';
import { createAdapter } from '../lib/dns/DnsHelper';
import { Domain, DnsAccount } from '../types';

const log = createLogger('RecordCountCache');
/**
 * 刷新单个域名的记录数缓存
 */
async function refreshDomainRecordCount(domain: Domain, account: DnsAccount): Promise<void> {
  try {
    // MySQL JSON type returns object directly, SQLite/PostgreSQL returns string
    const cfg = typeof account.config === 'string'
      ? JSON.parse(account.config) as Record<string, string>
      : account.config as Record<string, string>;

    const dnsAdapter = createAdapter(account.type, cfg, domain.name, domain.third_id);
    const result = await dnsAdapter.getDomainRecords(1, 10);

    if (result.total !== domain.record_count) {
      await DomainOperations.updateRecordCount(domain.id, result.total);
      log.info(`Updated record count for ${domain.name}: ${domain.record_count} -> ${result.total}`);
    }
  } catch (error) {
    log.warn(`Failed to refresh record count for ${domain.name}`, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * 批量刷新域名记录数缓存
 * 使用串行处理避免同时发起大量请求
 */
export async function refreshAllDomainRecordCounts(): Promise<void> {
  //#region debug-point mem-leak-record-cache-entry
  const m0 = process.memoryUsage();
  log.tag('MEM-LEAK-DEBUG').info('refreshAllDomainRecordCounts entry', {
    rssMB: +(m0.rss / 1024 / 1024).toFixed(1),
    heapUsedMB: +(m0.heapUsed / 1024 / 1024).toFixed(1),
    heapTotalMB: +(m0.heapTotal / 1024 / 1024).toFixed(1),
  });
  //#endregion
  log.info('Starting record count cache refresh');

  try {
    // 获取所有域名
    const domains = await DomainOperations.getAll() as unknown as Domain[];

    if (domains.length === 0) {
      log.info('No domains to refresh');
      return;
    }

    //#region debug-point mem-leak-record-cache-loaded
    const m1 = process.memoryUsage();
    log.tag('MEM-LEAK-DEBUG').info('DomainOperations.getAll loaded', {
      domainCount: domains.length,
      rssMB: +(m1.rss / 1024 / 1024).toFixed(1),
      heapUsedMB: +(m1.heapUsed / 1024 / 1024).toFixed(1),
      heapTotalMB: +(m1.heapTotal / 1024 / 1024).toFixed(1),
    });
    //#endregion
    log.info(`Found ${domains.length} domains to refresh`);

    // 按账号分组，减少重复获取账号信息
    const accountCache = new Map<number, DnsAccount>();
    let successCount = 0;
    let failCount = 0;

    // 串行处理，避免并发过多请求
    for (const domain of domains) {
      // 获取或缓存账号信息
      let account = accountCache.get(domain.account_id);
      if (!account) {
        account = await DnsAccountOperations.getById(domain.account_id) as DnsAccount | undefined;
        if (!account) {
          log.warn(`Account not found for domain ${domain.name} (id: ${domain.account_id})`);
          failCount++;
          continue;
        }
        accountCache.set(domain.account_id, account);
      }

      // 刷新该域名的记录数
      await refreshDomainRecordCount(domain, account);
      successCount++;

      // 每处理 10 个域名后稍作延迟，避免请求过快
      if (successCount % 10 === 0) {
        //#region debug-point mem-leak-record-cache-loop
        const m = process.memoryUsage();
        log.tag('MEM-LEAK-DEBUG').info('refreshAllDomainRecordCounts progress', {
          progress: `${successCount}/${domains.length}`,
          accountCacheSize: accountCache.size,
          rssMB: +(m.rss / 1024 / 1024).toFixed(1),
          heapUsedMB: +(m.heapUsed / 1024 / 1024).toFixed(1),
        });
        //#endregion
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    //#region debug-point mem-leak-record-cache-done
    const mEnd = process.memoryUsage();
    log.tag('MEM-LEAK-DEBUG').info('refreshAllDomainRecordCounts done', {
      successCount, failCount,
      rssMB: +(mEnd.rss / 1024 / 1024).toFixed(1),
      heapUsedMB: +(mEnd.heapUsed / 1024 / 1024).toFixed(1),
      heapTotalMB: +(mEnd.heapTotal / 1024 / 1024).toFixed(1),
    });
    //#endregion
    log.info(`Cache refresh completed: ${successCount} succeeded, ${failCount} failed`);
  } catch (error) {
    log.error('Failed to refresh record count cache', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * 启动定时刷新任务
 * @param intervalMinutes 刷新间隔（分钟），默认 30 分钟
 */
export function startRecordCountCacheRefresh(intervalMinutes: number = 30): void {
  const intervalMs = intervalMinutes * 60 * 1000;

  log.info(`Starting periodic cache refresh (interval: ${intervalMinutes} minutes)`);

  // 立即执行一次（高优先级）
  taskManager.submit(
    {
      id: 'record-count-cache-initial',
      name: 'Record Count Cache Initial Refresh',
      priority: 'high',          // 高优先级，可以插队
      concurrency: 1,            // 串行执行
      timeout: 600000,           // 10分钟超时
      retries: 1,                // 失败重试1次
      retryDelay: 30000,         // 重试间隔30秒
    },
    refreshAllDomainRecordCounts
  ).catch(err => {
    log.error('Initial cache refresh failed', { error: err });
  });

  // 设置定时任务（高优先级）
  setInterval(() => {
    taskManager.submit(
      {
        id: `record-count-cache-${Date.now()}`,
        name: 'Record Count Cache Periodic Refresh',
        priority: 'high',        // 高优先级，可以插队
        concurrency: 1,          // 串行执行
        timeout: 600000,         // 10分钟超时
        retries: 1,              // 失败重试1次
        retryDelay: 30000,       // 重试间隔30秒
      },
      refreshAllDomainRecordCounts
    ).catch(err => {
      log.error('Periodic cache refresh failed', { error: err });
    });
  }, intervalMs);
}
