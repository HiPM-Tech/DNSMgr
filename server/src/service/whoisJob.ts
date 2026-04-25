import { WhoisOperations } from '../db/business-adapter';
import { Domain } from '../types';
import { sendNotification } from './notification';
import { connect } from '../db/core/connection';
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
 * WHOIS 查询结果
 */
export interface WhoisCheckResult {
  expiryDate: Date | null;
  apexExpiryDate: Date | null;
  registrar: string | null;
  nameServers: string[];
}

/**
 * 检查单个域名的 WHOIS
 */
export async function checkWhoisForDomain(domainName: string): Promise<WhoisCheckResult> {
  try {
    log.info('WhoisJob', `Checking WHOIS for ${domainName}`);
    
    // 检查缓存
    const cached = getCachedWhois(domainName);
    if (cached?.expiryDate) {
      log.info('WhoisJob', `Using cached expiry for ${domainName}: ${cached.expiryDate.toISOString()}`);
      return {
        expiryDate: cached.expiryDate,
        apexExpiryDate: cached.apexExpiryDate || null,
        registrar: cached.registrar,
        nameServers: cached.nameServers,
      };
    }

    // 查询 WHOIS
    const result = await queryWhois(domainName);

    if (result?.expiryDate) {
      setCachedWhois(domainName, result);
      log.info('WhoisJob', `Got expiry date for ${domainName}: ${result.expiryDate.toISOString()}`, {
        hasApexExpiry: !!result.apexExpiryDate,
        apexExpiryDate: result.apexExpiryDate?.toISOString(),
      });
      return {
        expiryDate: result.expiryDate,
        apexExpiryDate: result.apexExpiryDate || null,
        registrar: result.registrar,
        nameServers: result.nameServers,
      };
    }

    log.warn('WhoisJob', `No expiry date found for ${domainName}`, {
      domain: domainName,
      hasResult: !!result,
      resultKeys: result ? Object.keys(result) : null,
    });
  } catch (error) {
    log.error('WhoisJob', `Error checking ${domainName}:`, {
      domain: domainName,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    expiryDate: null,
    apexExpiryDate: null,
    registrar: null,
    nameServers: [],
  };
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
    const domains = await WhoisOperations.getAllDomains() as unknown as Domain[];
  } catch (error) {
    // Check if it's a connection error, try to reconnect
    if (error instanceof Error && error.message.includes('Database connection not initialized')) {
      log.warn('WhoisJob', 'Database connection lost, attempting to reconnect...');
      try {
        await connect();
        log.info('WhoisJob', 'Database reconnected successfully, retrying...');
        // Retry once
        const domains = await WhoisOperations.getAllDomains() as unknown as Domain[];
      } catch (reconnectError) {
        log.error('WhoisJob', 'Failed to reconnect to database', { error: reconnectError });
        return;
      }
    } else {
      throw error;
    }
  }

  try {
    const domains = await WhoisOperations.getAllDomains() as unknown as Domain[];
    log.info('WhoisJob', `Found ${domains.length} domains to sync`, {
      domainNames: domains.map(d => d.name),
    });

    let successCount = 0;
    let failCount = 0;
    const failedDomains: string[] = [];

    // 使用并发控制，最多 3 个并发请求
    await asyncPool(3, domains, async (d) => {
      try {
        log.info('WhoisJob', `Processing domain: ${d.name}`);
        const whoisResult = await checkWhoisForDomain(d.name);

        if (whoisResult.expiryDate) {
          // 更新数据库
          const formattedDate = formatDateForMySQL(whoisResult.expiryDate);
          const formattedApexDate = whoisResult.apexExpiryDate 
            ? formatDateForMySQL(whoisResult.apexExpiryDate) 
            : null;
          await WhoisOperations.updateExpiry(d.id, formattedDate, formattedApexDate);

          successCount++;
          log.info('WhoisJob', `Updated expiry for ${d.name}: ${formattedDate}`, {
            apexExpiryDate: formattedApexDate,
          });

          // 检查是否需要发送通知
          await checkAndSendNotification(d, whoisResult.expiryDate);
        } else {
          failCount++;
          failedDomains.push(d.name);
          log.warn('WhoisJob', `Failed to get expiry for ${d.name}`);
        }
      } catch (error) {
        failCount++;
        failedDomains.push(d.name);
        log.error('WhoisJob', `Error processing ${d.name}:`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    log.info('WhoisJob', `WHOIS sync completed: ${successCount} success, ${failCount} failed`, {
      failedDomains: failedDomains.slice(0, 20), // 最多显示20个失败的域名
      totalFailed: failedDomains.length,
    });
  } catch (error) {
    log.error('WhoisJob', 'Sync failed:', {
      error: error instanceof Error ? error.message : String(error),
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
    const enableNotifyRow = await WhoisOperations.getNotificationSetting() as any;
    const enableNotify = enableNotifyRow ? enableNotifyRow.value === '1' || enableNotifyRow.value === 'true' : false;

    const thresholdRow = await WhoisOperations.getExpiryDays() as any;
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
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 立即同步单个域名的 WHOIS
 */
export async function syncDomainWhois(domainId: number): Promise<{ success: boolean; expiresAt: Date | null; apexExpiresAt?: Date | null; message?: string }> {
  try {
    log.info('WhoisJob', `Syncing WHOIS for domain ID: ${domainId}`);
    
    const domain = await WhoisOperations.getDomainById(domainId) as Domain | undefined;

    if (!domain) {
      log.warn('WhoisJob', `Domain not found: ${domainId}`);
      return { success: false, expiresAt: null, message: 'Domain not found' };
    }

    log.info('WhoisJob', `Found domain: ${domain.name} (ID: ${domainId})`);
    const whoisResult = await checkWhoisForDomain(domain.name);

    if (whoisResult.expiryDate) {
      const formattedDate = formatDateForMySQL(whoisResult.expiryDate);
      const formattedApexDate = whoisResult.apexExpiryDate 
        ? formatDateForMySQL(whoisResult.apexExpiryDate) 
        : null;
      await WhoisOperations.updateExpiry(domainId, formattedDate, formattedApexDate);
      log.info('WhoisJob', `Successfully synced WHOIS for ${domain.name}: ${formattedDate}`, {
        apexExpiryDate: formattedApexDate,
      });
      return { 
        success: true, 
        expiresAt: whoisResult.expiryDate,
        apexExpiresAt: whoisResult.apexExpiryDate,
      };
    }

    log.warn('WhoisJob', `Could not retrieve expiry date for ${domain.name}`);
    return { success: false, expiresAt: null, message: 'Could not retrieve expiry date' };
  } catch (error) {
    log.error('WhoisJob', `Error syncing domain ${domainId}:`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      expiresAt: null,
      message: error instanceof Error ? error.message : 'Unknown error',
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

  // 每小时运行一次
  setInterval(() => {
    syncAllDomainsWhois().catch(err => log.error('WhoisJob', 'Scheduled sync error:', { error: err }));
  }, 60 * 60 * 1000);

  log.info('WhoisJob', 'WHOIS job scheduler started (every 1 hour)');
}
