/**
 * WHOIS 查询调度器接口
 * 所有支持 WHOIS 查询的 DNS 提供商需要实现此接口并向核心注册
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
  queryWhois(config: any, domain: string): Promise<WhoisResult | null>;
}

/**
 * WHOIS 查询结果
 */
export interface WhoisResult {
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
