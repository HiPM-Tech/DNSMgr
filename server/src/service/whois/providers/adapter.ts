/**
 * DNS 提供商 WHOIS 适配器
 * 
 * 负责注册和管理支持 WHOIS 查询的 DNS 提供商
 */

import { dnsheWhoisScheduler } from '../../../lib/dns/providers';
import { createLogger } from '../../../lib/logger';

const log = createLogger('WhoisService').sub('DnsProviderAdapter');

/**
 * WHOIS 调度器接口
 */
export interface WhoisScheduler {
  readonly type: string;
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
 * DNS 提供商 WHOIS 适配器注册表
 */
class DnsProviderAdapterRegistry {
  private adapters: Map<string, WhoisScheduler> = new Map();

  /**
   * 注册 DNS 提供商 WHOIS 适配器
   */
  register(adapter: WhoisScheduler): void {
    if (this.adapters.has(adapter.type)) {
      log.warn(`Adapter for type "${adapter.type}" already registered, overwriting`);
    }
    this.adapters.set(adapter.type, adapter);
    log.info(`Registered adapter for type: ${adapter.type}`);
  }

  /**
   * 获取指定类型的适配器
   */
  getAdapter(type: string): WhoisScheduler | null {
    return this.adapters.get(type) || null;
  }

  /**
   * 检查是否已注册
   */
  hasAdapter(type: string): boolean {
    return this.adapters.has(type);
  }

  /**
   * 获取所有已注册类型
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.adapters.keys());
  }
}

// 导出单例实例
export const dnsProviderAdapter = new DnsProviderAdapterRegistry();

/**
 * 初始化 DNS 提供商适配器
 * 在应用启动时注册所有支持 WHOIS 的 DNS 提供商
 */
export function initDnsProviderAdapters(): void {
  // 注册 DNSHE WHOIS 适配器
  dnsProviderAdapter.register(dnsheWhoisScheduler);
  
  // 未来可以在这里注册其他提供商的适配器
  // dnsProviderAdapter.register(alicloudWhoisAdapter);
  // dnsProviderAdapter.register(cloudflareWhoisAdapter);
  
  const registeredTypes = dnsProviderAdapter.getRegisteredTypes();
  log.info(`Initialized adapters for: ${registeredTypes.join(', ')}`);
}
