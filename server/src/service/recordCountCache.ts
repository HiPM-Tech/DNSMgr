import { log } from '../lib/logger';
import { DomainOperations, DnsAccountOperations } from '../db/business-adapter';
import { createAdapter } from '../lib/dns/DnsHelper';
import { Domain, DnsAccount } from '../types';

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
      log.info('RecordCountCache', `Updated record count for ${domain.name}: ${domain.record_count} -> ${result.total}`);
    }
  } catch (error) {
    log.warn('RecordCountCache', `Failed to refresh record count for ${domain.name}`, { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

/**
 * 批量刷新域名记录数缓存
 * 使用串行处理避免同时发起大量请求
 */
export async function refreshAllDomainRecordCounts(): Promise<void> {
  log.info('RecordCountCache', 'Starting record count cache refresh');
  
  try {
    // 获取所有域名
    const domains = await DomainOperations.getAll() as unknown as Domain[];
    
    if (domains.length === 0) {
      log.info('RecordCountCache', 'No domains to refresh');
      return;
    }
    
    log.info('RecordCountCache', `Found ${domains.length} domains to refresh`);
    
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
          log.warn('RecordCountCache', `Account not found for domain ${domain.name} (id: ${domain.account_id})`);
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
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    log.info('RecordCountCache', `Cache refresh completed: ${successCount} succeeded, ${failCount} failed`);
  } catch (error) {
    log.error('RecordCountCache', 'Failed to refresh record count cache', { 
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
  
  log.info('RecordCountCache', `Starting periodic cache refresh (interval: ${intervalMinutes} minutes)`);
  
  // 立即执行一次
  refreshAllDomainRecordCounts().catch(err => {
    log.error('RecordCountCache', 'Initial cache refresh failed', { error: err });
  });
  
  // 设置定时任务
  setInterval(() => {
    refreshAllDomainRecordCounts().catch(err => {
      log.error('RecordCountCache', 'Periodic cache refresh failed', { error: err });
    });
  }, intervalMs);
}
