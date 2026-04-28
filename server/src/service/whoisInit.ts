/**
 * WHOIS 调度器初始化
 * 在应用启动时注册所有支持 WHOIS 的 DNS 提供商调度器
 */

import { whoisRegistry } from './whoisScheduler';
import { dnsheWhoisScheduler } from '../lib/dns/providers';

/**
 * 初始化 WHOIS 调度器
 * 注册所有支持 WHOIS 的 DNS 提供商
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
