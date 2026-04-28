/**
 * 域名续期调度器接口
 * 所有支持续期的 DNS 提供商需要实现此接口并向核心注册
 */

export interface RenewalScheduler {
  /**
   * 提供商类型标识
   */
  readonly type: string;

  /**
   * 获取该提供商下所有需要续期的域名列表
   * @param config 提供商配置
   * @returns 域名列表，包含到期时间等信息
   */
  listRenewableDomains(config: any): Promise<RenewableDomain[]>;

  /**
   * 续期指定域名
   * @param config 提供商配置
   * @param domainId 域名 ID
   * @returns 续期结果
   */
  renewDomain(config: any, domainId: number | string): Promise<RenewalResult | null>;
}

/**
 * 可续期域名信息
 */
export interface RenewableDomain {
  id: number | string;
  name: string;
  full_domain?: string;
  expires_at?: string;
  status?: string;
  account_id?: number;
  account_name?: string;
  [key: string]: any;
}

/**
 * 续期结果
 */
export interface RenewalResult {
  success: boolean;
  domain_id: number | string;
  domain_name: string;
  previous_expires_at?: string;
  new_expires_at?: string;
  remaining_days?: number;
  message?: string;
  [key: string]: any;
}

/**
 * 续期调度器注册表
 */
class RenewalSchedulerRegistry {
  private schedulers: Map<string, RenewalScheduler> = new Map();

  /**
   * 注册续期调度器
   * @param scheduler 调度器实例
   */
  register(scheduler: RenewalScheduler): void {
    if (this.schedulers.has(scheduler.type)) {
      console.warn(`[RenewalRegistry] Scheduler for type "${scheduler.type}" already registered, overwriting`);
    }
    this.schedulers.set(scheduler.type, scheduler);
    console.log(`[RenewalRegistry] Registered renewal scheduler for type: ${scheduler.type}`);
  }

  /**
   * 获取指定类型的续期调度器
   * @param type 提供商类型
   * @returns 调度器实例，如果未注册则返回 null
   */
  getScheduler(type: string): RenewalScheduler | null {
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
   * 获取所有支持续期的提供商类型
   * @returns 调度器映射
   */
  getAllSchedulers(): Map<string, RenewalScheduler> {
    return new Map(this.schedulers);
  }
}

// 导出单例实例
export const renewalRegistry = new RenewalSchedulerRegistry();
