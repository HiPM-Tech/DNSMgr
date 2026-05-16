/**
 * WHOIS 调度器注册表
 * 
 * 所有支持 WHOIS 查询的 DNS 提供商需要实现此接口并向核心注册
 */

import { dnsheWhoisScheduler } from '../../lib/dns/providers';

/**
 * WHOIS 调度器接口
 */
export interface WhoisScheduler {
  /**
   * 提供商类型标识
   */
  readonly type: string;

  /**
   * 查询域名的 WHOIS 信息
   * @param config 提供商配置
   * @param domain 要查询的域名
   * @returns WHOIS 信息，如果查询失败则返回 null
   */
  queryWhois(config: any, domain: string): Promise<WhoisSchedulerResult | null>;
}

/**
 * WHOIS 调度器查询结果
 */
export interface WhoisSchedulerResult {
  success: boolean;
  domain: string;
  registrar?: string;
  registrant?: string;
  creation_date?: string;
  expiration_date?: string;
  updated_date?: string;
  name_servers?: string[];
  status?: string[];
  dnssec?: string;
  raw_data?: string;
  [key: string]: any;
}

/**
 * WHOIS 查询策略
 */
export enum WhoisQueryStrategy {
  /**
   * 顶域查询策略：顶域 > DNS提供商 > 第三方查询
   */
  TOP_LEVEL = 'top_level',
  
  /**
   * 子域查询策略：DNS提供商 > 子域/顶域并行 > 第三方查询
   */
  SUB_DOMAIN = 'sub_domain',
}

/**
 * WHOIS 调度器注册表
 */
class WhoisSchedulerRegistry {
  private schedulers: Map<string, WhoisScheduler> = new Map();

  /**
   * 注册 WHOIS 调度器
   * @param scheduler 调度器实例
   */
  register(scheduler: WhoisScheduler): void {
    if (this.schedulers.has(scheduler.type)) {
      console.warn(`[WhoisRegistry] Scheduler for type "${scheduler.type}" already registered, overwriting`);
    }
    this.schedulers.set(scheduler.type, scheduler);
    console.log(`[WhoisRegistry] Registered WHOIS scheduler for type: ${scheduler.type}`);
  }

  /**
   * 获取指定类型的 WHOIS 调度器
   * @param type 提供商类型
   * @returns 调度器实例，如果未注册则返回 null
   */
  getScheduler(type: string): WhoisScheduler | null {
    return this.schedulers.get(type) || null;
  }

  /**
   * 检查是否已注册指定类型的调度器
   * @param type 提供商类型
   * @returns 是否已注册
   */
  hasScheduler(type: string): boolean {
    return this.schedulers.has(type);
  }

  /**
   * 获取所有已注册的调度器类型
   * @returns 类型列表
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.schedulers.keys());
  }

  /**
   * 获取所有支持 WHOIS 的提供商类型
   * @returns 调度器映射
   */
  getAllSchedulers(): Map<string, WhoisScheduler> {
    return new Map(this.schedulers);
  }
}

// 导出单例实例
export const whoisRegistry = new WhoisSchedulerRegistry();

/**
 * 初始化 WHOIS 调度器
 * 在应用启动时注册所有支持 WHOIS 的 DNS 提供商调度器
 */
export function initWhoisSchedulers(): void {
  // 注册 DNSHE WHOIS 调度器
  whoisRegistry.register(dnsheWhoisScheduler);
  
  // 未来可以在这里注册其他提供商的调度器
  // whoisRegistry.register(alicloudWhoisScheduler);
  // whoisRegistry.register(cloudflareWhoisScheduler);
  
  const registeredTypes = whoisRegistry.getRegisteredTypes();
  console.log(`[WhoisInit] Registered WHOIS schedulers for: ${registeredTypes.join(', ')}`);
}

/**
 * 同步所有域名的 WHOIS 信息
 */
export async function syncAllDomainsWhois(): Promise<void> {
  const { WhoisOperations } = await import('../../db/business-adapter');
  const { connect } = await import('../../db/core/connection');
  const { taskManager } = await import('../taskManager');
  const { log } = await import('../../lib/logger');
  const { checkWhoisForDomain } = await import('./checker');
  const { checkAndSendNotification } = await import('./notifier');
  
  log.info('WhoisScheduler', 'Starting WHOIS sync for all domains');

  let domains: any[] = [];
  try {
    domains = await WhoisOperations.getAllDomains();
  } catch (error) {
    if (error instanceof Error && error.message.includes('Database connection not initialized')) {
      log.warn('WhoisScheduler', 'Database connection lost, attempting to reconnect...');
      try {
        await connect();
        log.info('WhoisScheduler', 'Database reconnected successfully, retrying...');
        domains = await WhoisOperations.getAllDomains();
      } catch (reconnectError) {
        log.error('WhoisScheduler', 'Failed to reconnect to database');
        return;
      }
    } else {
      throw error;
    }
  }

  log.info('WhoisScheduler', `Found ${domains.length} domains to sync`);

  let successCount = 0;
  let failCount = 0;
  const failedDomains: string[] = [];

  const tasks = domains.map((d: any) => {
    return taskManager.submit(
      {
        id: `whois-${d.id}`,
        name: `WHOIS Sync: ${d.name}`,
        concurrency: 3,
        timeout: 60000,
        retries: 1,
        retryDelay: 5000,
      },
      async () => {
        try {
          const whoisResult = await checkWhoisForDomain(d.name);

          if (whoisResult.expiryDate) {
            const year = whoisResult.expiryDate.getFullYear();
            const month = String(whoisResult.expiryDate.getMonth() + 1).padStart(2, '0');
            const day = String(whoisResult.expiryDate.getDate()).padStart(2, '0');
            const hours = String(whoisResult.expiryDate.getHours()).padStart(2, '0');
            const minutes = String(whoisResult.expiryDate.getMinutes()).padStart(2, '0');
            const seconds = String(whoisResult.expiryDate.getSeconds()).padStart(2, '0');
            const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            
            const formattedApexDate = whoisResult.apexExpiryDate 
              ? (() => {
                  const y = whoisResult.apexExpiryDate!.getFullYear();
                  const m = String(whoisResult.apexExpiryDate!.getMonth() + 1).padStart(2, '0');
                  const d = String(whoisResult.apexExpiryDate!.getDate()).padStart(2, '0');
                  const h = String(whoisResult.apexExpiryDate!.getHours()).padStart(2, '0');
                  const min = String(whoisResult.apexExpiryDate!.getMinutes()).padStart(2, '0');
                  const s = String(whoisResult.apexExpiryDate!.getSeconds()).padStart(2, '0');
                  return `${y}-${m}-${d} ${h}:${min}:${s}`;
                })()
              : null;
              
            await WhoisOperations.updateExpiry(d.id, formattedDate, formattedApexDate, whoisResult.status);

            successCount++;
            log.info('WhoisScheduler', `Updated expiry for ${d.name}: ${formattedDate}`);

            await checkAndSendNotification(d, whoisResult.expiryDate);
          } else {
            failCount++;
            failedDomains.push(d.name);
            log.warn('WhoisScheduler', `Failed to get expiry for ${d.name}`);
          }
        } catch (error) {
          failCount++;
          failedDomains.push(d.name);
          log.error('WhoisScheduler', `Error processing ${d.name}`);
        }
      }
    );
  });

  await Promise.all(tasks);

  log.info('WhoisScheduler', `WHOIS sync completed: ${successCount} success, ${failCount} failed`, {
    failedDomains: failedDomains.slice(0, 20),
    totalFailed: failedDomains.length,
  });
}

/**
 * 启动 WHOIS 定时任务
 */
export async function startWhoisJob(): Promise<void> {
  const { WhoisOperations } = await import('../../db/business-adapter');
  const { taskManager } = await import('../taskManager');
  const { log } = await import('../../lib/logger');
  
  // 初始化 WHOIS 缓存表
  try {
    await WhoisOperations.ensureWhoisCacheTable();
    log.info('WhoisScheduler', 'WHOIS cache table initialized');
  } catch (error) {
    log.error('WhoisScheduler', 'Failed to initialize WHOIS cache table');
  }

  // 启动后 30 秒运行第一次
  setTimeout(() => {
    taskManager.submit(
      {
        id: 'whois-sync-initial',
        name: 'WHOIS Initial Sync',
        concurrency: 3,
        timeout: 300000,
        retries: 1,
        retryDelay: 10000,
      },
      syncAllDomainsWhois
    ).catch(err => log.error('WhoisScheduler', 'Initial sync error'));
  }, 30 * 1000);

  // 每小时运行一次
  setInterval(() => {
    taskManager.submit(
      {
        id: `whois-sync-${Date.now()}`,
        name: 'WHOIS Scheduled Sync',
        concurrency: 3,
        timeout: 300000,
        retries: 1,
        retryDelay: 10000,
      },
      syncAllDomainsWhois
    ).catch(err => log.error('WhoisScheduler', 'Scheduled sync error'));
  }, 60 * 60 * 1000);

  log.info('WhoisScheduler', 'WHOIS job scheduler started (every 1 hour)');
}
