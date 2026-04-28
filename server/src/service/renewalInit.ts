/**
 * 续期调度器初始化
 * 在应用启动时注册所有支持续期的 DNS 提供商调度器
 */

import { renewalRegistry } from './renewalScheduler';
import { dnsheRenewalScheduler } from '../lib/dns/providers';

/**
 * 初始化续期调度器
 * 注册所有支持续期的 DNS 提供商
 */
export function initRenewalSchedulers(): void {
  // 注册 DNSHE 续期调度器
  renewalRegistry.register(dnsheRenewalScheduler);
  
  // 未来可以在这里注册其他提供商的调度器
  // renewalRegistry.register(alicloudRenewalScheduler);
  // renewalRegistry.register(cloudflareRenewalScheduler);
  
  const registeredTypes = renewalRegistry.getRegisteredTypes();
  console.log(`[RenewalInit] Registered renewal schedulers for: ${registeredTypes.join(', ')}`);
}
