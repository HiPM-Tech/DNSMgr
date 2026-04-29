import { WhoisOperations, DnsAccountOperations } from '../db/business-adapter';
import { Domain, DnsAccount } from '../types';
import { sendNotification } from './notification';
import { connect } from '../db/core/connection';
import { taskManager } from './taskManager';
import { log } from '../lib/logger';
import { queryWhois, getRootDomain, WhoisResult } from './whoisProvider';
import { createAdapter } from '../lib/dns/DnsHelper';

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

// WHOIS 数据库缓存配置
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 小时
const CACHE_TTL_SECONDS = Math.floor(CACHE_TTL / 1000);

/**
 * 从数据库获取缓存的 WHOIS 结果
 */
async function getCachedWhois(domain: string): Promise<WhoisResult | null> {
  try {
    const row = await WhoisOperations.getCachedWhois(domain, CACHE_TTL_SECONDS);
    
    if (row) {
      log.debug('WhoisJob', `Database cache hit for ${domain}`);
      
      return {
        domain: (row as any).domain || domain,
        expiryDate: (row as any).expiry_date ? new Date((row as any).expiry_date) : null,
        apexExpiryDate: (row as any).apex_expiry_date ? new Date((row as any).apex_expiry_date) : null,
        registrar: (row as any).registrar || null,
        nameServers: (row as any).name_servers ? JSON.parse((row as any).name_servers) : [],
        raw: (row as any).raw_data || '',
      };
    }
    
    return null;
  } catch (error) {
    log.error('WhoisJob', 'Failed to get cached WHOIS', { domain, error });
    return null;
  }
}

/**
 * 将 WHOIS 结果缓存到数据库
 */
async function setCachedWhois(domain: string, result: WhoisResult): Promise<void> {
  try {
    await WhoisOperations.setCachedWhois(
      domain,
      result.expiryDate ? formatDateForMySQL(result.expiryDate) : null,
      result.apexExpiryDate ? formatDateForMySQL(result.apexExpiryDate) : null,
      result.registrar || null,
      JSON.stringify(result.nameServers || []),
      JSON.stringify(result)
    );
    log.debug('WhoisJob', `Cached WHOIS result for ${domain}`);
  } catch (error) {
    log.error('WhoisJob', 'Failed to cache WHOIS result', { domain, error });
  }
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
    
    // 检查数据库缓存
    const cached = await getCachedWhois(domainName);
    if (cached?.expiryDate) {
      log.info('WhoisJob', `Using cached expiry for ${domainName}: ${cached.expiryDate.toISOString()}`);
      return {
        expiryDate: cached.expiryDate,
        apexExpiryDate: cached.apexExpiryDate || null,
        registrar: cached.registrar,
        nameServers: cached.nameServers,
      };
    }

    // 使用 WHOIS 查询（包含顶域查询、第三方查询等多元查询）
    log.info('WhoisJob', `Querying WHOIS for ${domainName} (includes apex and third-party queries)`);
    const whoisResult = await queryWhois(domainName);

    // 尝试从 DNS 提供商 API 获取到期时间
    const providerExpiryDate = await getExpiryFromProvider(domainName);

    // 判断是否为顶域
    const rootDomain = getRootDomain(domainName);
    const isApexDomain = domainName.toLowerCase() === rootDomain.toLowerCase();

    let finalExpiryDate: Date | null = null;
    let finalApexExpiryDate: Date | null = whoisResult?.apexExpiryDate || null;

    if (isApexDomain) {
      // 顶域：顶域 WHOIS > DNS 提供商 API > 第三方
      if (whoisResult?.expiryDate) {
        finalExpiryDate = whoisResult.expiryDate;
        log.info('WhoisJob', `Using apex WHOIS expiry for ${domainName}: ${finalExpiryDate.toISOString()}`);
      } else if (providerExpiryDate) {
        finalExpiryDate = providerExpiryDate;
        log.info('WhoisJob', `Using DNS provider API expiry for ${domainName}: ${finalExpiryDate.toISOString()}`);
      }
    } else {
      // 子域：DNS 提供商 API > 顶域 WHOIS > 第三方
      if (providerExpiryDate) {
        finalExpiryDate = providerExpiryDate;
        log.info('WhoisJob', `Using DNS provider API expiry for ${domainName}: ${finalExpiryDate.toISOString()}`);
      } else if (whoisResult?.expiryDate) {
        finalExpiryDate = whoisResult.expiryDate;
        log.info('WhoisJob', `Using WHOIS expiry for ${domainName}: ${finalExpiryDate.toISOString()}`);
      }
    }

    if (finalExpiryDate) {
      const result: WhoisResult = {
        domain: domainName,
        expiryDate: finalExpiryDate,
        apexExpiryDate: finalApexExpiryDate,
        registrar: whoisResult?.registrar || null,
        nameServers: whoisResult?.nameServers || [],
        raw: whoisResult?.raw || '',
      };
      setCachedWhois(domainName, result);
      return {
        expiryDate: finalExpiryDate,
        apexExpiryDate: finalApexExpiryDate,
        registrar: whoisResult?.registrar || null,
        nameServers: whoisResult?.nameServers || [],
      };
    }

    log.warn('WhoisJob', `No expiry date found for ${domainName}`, {
      domain: domainName,
      hasResult: !!whoisResult,
      resultKeys: whoisResult ? Object.keys(whoisResult) : null,
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
 * 尝试从 DNS 提供商 API 获取域名到期时间
 * 目前只有 VPS8 支持此功能
 * 注意：彩虹聚合DNS和DnsMgr的API返回的到期时间不准确，不使用
 */
async function getExpiryFromProvider(domainName: string): Promise<Date | null> {
  try {
    // 查找域名对应的账号
    const allDomains = await WhoisOperations.getAllDomains() as unknown as Domain[];
    const domain = allDomains.find(d => d.name === domainName);
    
    if (!domain || !domain.account_id) {
      log.debug('WhoisJob', `No account_id found for ${domainName}, skipping provider check`);
      return null;
    }

    // 获取账号信息
    const account = await DnsAccountOperations.getById(domain.account_id) as DnsAccount | undefined;
    if (!account) {
      log.debug('WhoisJob', `No account found for ID ${domain.account_id}`);
      return null;
    }

    // 排除不支持或不准确的提供商
    // 彩虹聚合DNS和DnsMgr的API返回的到期时间不准确，不使用
    const excludedProviders = ['caihongdns', 'dnsmgr'];
    if (excludedProviders.includes(account.type)) {
      log.debug('WhoisJob', `Provider ${account.type} is excluded from expiry date check (inaccurate)`);
      return null;
    }

    // 创建 DNS 适配器
    const config = JSON.parse(account.config);
    const adapter = createAdapter(account.type, config, domainName);
    
    // 检查适配器是否支持获取域名列表（包含到期时间）
    // 目前只有 VPS8 实现了 ExpiresAt 字段
    const domainList = await adapter.getDomainList();
    const domainInfo = domainList.list.find((d: any) => d.Domain.toLowerCase() === domainName.toLowerCase());
    
    if (domainInfo?.ExpiresAt) {
      const expiryDate = new Date(domainInfo.ExpiresAt);
      if (!isNaN(expiryDate.getTime())) {
        log.info('WhoisJob', `Found expiry date from provider for ${domainName}: ${expiryDate.toISOString()}`);
        return expiryDate;
      }
    }

    return null;
  } catch (error) {
    log.debug('WhoisJob', `Failed to get expiry from provider for ${domainName}:`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
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

  let domains: Domain[] = [];
  try {
    domains = await WhoisOperations.getAllDomains() as unknown as Domain[];
  } catch (error) {
    // Check if it's a connection error, try to reconnect
    if (error instanceof Error && error.message.includes('Database connection not initialized')) {
      log.warn('WhoisJob', 'Database connection lost, attempting to reconnect...');
      try {
        await connect();
        log.info('WhoisJob', 'Database reconnected successfully, retrying...');
        // Retry once
        domains = await WhoisOperations.getAllDomains() as unknown as Domain[];
      } catch (reconnectError) {
        log.error('WhoisJob', 'Failed to reconnect to database', { error: reconnectError });
        return;
      }
    } else {
      throw error;
    }
  }

  log.info('WhoisJob', `Found ${domains.length} domains to sync`, {
    domainNames: domains.map(d => d.name),
  });

  let successCount = 0;
  let failCount = 0;
  const failedDomains: string[] = [];

  // 使用任务管理器并发处理（最多3个并发）
  const tasks = domains.map(d => {
    return taskManager.submit(
      {
        id: `whois-${d.id}`,
        name: `WHOIS Sync: ${d.name}`,
        concurrency: 3,       // 允许最多3个并发
        timeout: 60000,       // 60秒超时
        retries: 1,           // 失败重试1次
        retryDelay: 5000,     // 重试间隔5秒
      },
      async () => {
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
      }
    );
  });

  // 等待所有任务完成
  await Promise.all(tasks);

  log.info('WhoisJob', `WHOIS sync completed: ${successCount} success, ${failCount} failed`, {
    failedDomains: failedDomains.slice(0, 20), // 最多显示20个失败的域名
    totalFailed: failedDomains.length,
  });
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
export async function startWhoisJob() {
  // 初始化 WHOIS 缓存表
  try {
    await WhoisOperations.ensureWhoisCacheTable();
    log.info('WhoisJob', 'WHOIS cache table initialized');
  } catch (error) {
    log.error('WhoisJob', 'Failed to initialize WHOIS cache table', { error });
  }

  // 启动后 30 秒运行第一次（给系统初始化时间）
  setTimeout(() => {
    taskManager.submit(
      {
        id: 'whois-sync-initial',
        name: 'WHOIS Initial Sync',
        concurrency: 3,       // 允许最多3个并发
        timeout: 300000,      // 5分钟超时
        retries: 1,           // 失败重试1次
        retryDelay: 10000,    // 重试间隔10秒
      },
      syncAllDomainsWhois
    ).catch(err => log.error('WhoisJob', 'Initial sync error:', { error: err }));
  }, 30 * 1000);

  // 每小时运行一次
  setInterval(() => {
    taskManager.submit(
      {
        id: `whois-sync-${Date.now()}`,
        name: 'WHOIS Scheduled Sync',
        concurrency: 3,       // 允许最多3个并发
        timeout: 300000,      // 5分钟超时
        retries: 1,           // 失败重试1次
        retryDelay: 10000,    // 重试间隔10秒
      },
      syncAllDomainsWhois
    ).catch(err => log.error('WhoisJob', 'Scheduled sync error:', { error: err }));
  }, 60 * 60 * 1000);

  log.info('WhoisJob', 'WHOIS job scheduler started (every 1 hour, with task manager)');
}
