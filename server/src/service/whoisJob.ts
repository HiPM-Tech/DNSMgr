import { query, get, execute, insert, run, now } from '../db';
import { Domain } from '../types';
import { sendNotification } from './notification';
import { log } from '../lib/logger';
import { queryWhois, getRootDomain, WhoisResult } from './whoisProvider';

/**
 * 将日期格式化为 MySQL 兼容的格式 (YYYY-MM-DD HH:mm:ss)
 */
function formatDateForMySQL(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 简单的内存缓存
interface CacheEntry {
  result: WhoisResult;
  timestamp: number;
}
const whoisCache = new Map<string, CacheEntry>();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 小时

/**
 * 获取缓存的 WHOIS 结果
 */
function getCachedWhois(domain: string): WhoisResult | null {
  const cached = whoisCache.get(domain);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    log.debug('WhoisJob', `Cache hit for ${domain}`);
    return cached.result;
  }
  return null;
}

/**
 * 缓存 WHOIS 结果
 */
function setCachedWhois(domain: string, result: WhoisResult): void {
  whoisCache.set(domain, {
    result,
    timestamp: Date.now(),
  });
}

/**
 * 检查单个域名的 WHOIS
 */
export async function checkWhoisForDomain(domainName: string): Promise<Date | null> {
  try {
    // 检查缓存
    const cached = getCachedWhois(domainName);
    if (cached?.expiryDate) {
      return cached.expiryDate;
    }
    
    // 查询 WHOIS
    const result = await queryWhois(domainName);
    
    if (result?.expiryDate) {
      setCachedWhois(domainName, result);
      return result.expiryDate;
    }
    
    log.warn('WhoisJob', `No expiry date found for ${domainName}`);
  } catch (error) {
    log.error('WhoisJob', `Error checking ${domainName}:`, { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
  
  return null;
}

/**
 * 并发控制包装器
 */
async function asyncPool<T, R>(concurrency: number, items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];
  
  for (const [index, item] of items.entries()) {
    const p = Promise.resolve().then(() => fn(item)).then(result => {
      results[index] = result;
    });
    executing.push(p);
    
    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(executing.findIndex(e => e === p), 1);
    }
  }
  
  await Promise.all(executing);
  return results;
}

/**
 * 同步所有域名的 WHOIS 信息
 */
export async function syncAllDomainsWhois() {
  log.info('WhoisJob', 'Starting WHOIS sync for all domains');
  
  try {
    const domains = await query('SELECT id, name FROM domains') as unknown as Domain[];
    log.info('WhoisJob', `Found ${domains.length} domains to sync`);
    
    let successCount = 0;
    let failCount = 0;
    
    // 使用并发控制，最多 3 个并发请求
    await asyncPool(3, domains, async (d) => {
      try {
        const expiresAt = await checkWhoisForDomain(d.name);
        
        if (expiresAt) {
          // 更新数据库
          const formattedDate = formatDateForMySQL(expiresAt);
          await query('UPDATE domains SET expires_at = ? WHERE id = ?', [
            formattedDate,
            d.id
          ]);
          
          successCount++;
          
          // 检查是否需要发送通知
          await checkAndSendNotification(d, expiresAt);
        } else {
          failCount++;
          log.warn('WhoisJob', `Failed to get expiry for ${d.name}`);
        }
      } catch (error) {
        failCount++;
        log.error('WhoisJob', `Error processing ${d.name}:`, { 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    });
    
    log.info('WhoisJob', `WHOIS sync completed: ${successCount} success, ${failCount} failed`);
  } catch (error) {
    log.error('WhoisJob', 'Sync failed:', { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

/**
 * 检查并发送过期通知
 */
async function checkAndSendNotification(domain: Domain, expiresAt: Date): Promise<void> {
  try {
    const nowTime = new Date();
    const daysLeft = Math.ceil((expiresAt.getTime() - nowTime.getTime()) / (1000 * 60 * 60 * 24));
    
    // 获取通知设置
    const enableNotifyRow = await get('SELECT value FROM system_settings WHERE key = ?', ['domain_expiry_notification']) as any;
    const enableNotify = enableNotifyRow ? enableNotifyRow.value === '1' || enableNotifyRow.value === 'true' : false;
    
    const thresholdRow = await get('SELECT value FROM system_settings WHERE key = ?', ['domain_expiry_days']) as any;
    const threshold = thresholdRow ? parseInt(thresholdRow.value) : 30;
    
    if (enableNotify && (daysLeft === threshold || daysLeft === 7 || daysLeft === 1)) {
      try {
        await sendNotification(
          `[DNSMgr] Domain Expiring Soon: ${domain.name}`,
          `Your domain ${domain.name} is expiring in ${daysLeft} days (on ${expiresAt.toLocaleDateString()}). Please renew it soon.`
        );
        log.info('WhoisJob', `Sent expiry notification for ${domain.name} (${daysLeft} days left)`);
      } catch (err) {
        log.error('WhoisJob', `Failed to send notification for ${domain.name}:`, { error: err });
      }
    }
  } catch (error) {
    log.error('WhoisJob', `Error checking notification for ${domain.name}:`, { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

/**
 * 立即同步单个域名的 WHOIS
 */
export async function syncDomainWhois(domainId: number): Promise<{ success: boolean; expiresAt: Date | null; message?: string }> {
  try {
    const domain = await get('SELECT id, name FROM domains WHERE id = ?', [domainId]) as Domain | undefined;
    
    if (!domain) {
      return { success: false, expiresAt: null, message: 'Domain not found' };
    }
    
    const expiresAt = await checkWhoisForDomain(domain.name);
    
    if (expiresAt) {
      const formattedDate = formatDateForMySQL(expiresAt);
      await query('UPDATE domains SET expires_at = ? WHERE id = ?', [formattedDate, domainId]);
      return { success: true, expiresAt };
    }
    
    return { success: false, expiresAt: null, message: 'Could not retrieve expiry date' };
  } catch (error) {
    log.error('WhoisJob', `Error syncing domain ${domainId}:`, { 
      error: error instanceof Error ? error.message : String(error) 
    });
    return { 
      success: false, 
      expiresAt: null, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * 启动 WHOIS 定时任务
 */
export function startWhoisJob() {
  // 启动后 30 秒运行第一次（给系统初始化时间）
  setTimeout(() => {
    syncAllDomainsWhois().catch(err => log.error('WhoisJob', 'Initial sync error:', { error: err }));
  }, 30 * 1000);

  // 每 24 小时运行一次
  setInterval(() => {
    syncAllDomainsWhois().catch(err => log.error('WhoisJob', 'Scheduled sync error:', { error: err }));
  }, 24 * 60 * 60 * 1000);
  
  log.info('WhoisJob', 'WHOIS job scheduler started');
}
