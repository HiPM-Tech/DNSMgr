/**
 * 续期调度器初始化
 * 扫描 registry 中 capabilities.renewal === true 的提供商，自动注册续期调度器
 */

import { renewalRegistry } from './renewalScheduler';
import { getProviderDefinitions } from '../lib/dns/providers/registry';
import { renewalSchedulers } from '../lib/dns/providers';
import { createLogger } from '../lib/logger';

const log = createLogger('Service').sub('RenewalInit');

/**
 * 初始化续期调度器
 * 扫描 ProviderDefinition 中 capabilities.renewal=true 的提供商，
 * 从 renewalSchedulers 列表中查找匹配的调度器并注册。
 *
 * 添加新的续期提供商只需：
 *   1. registry.ts 中设置 capabilities.renewal: true
 *   2. 实现 RenewalScheduler 并加入 providers/index.ts 的 renewalSchedulers 数组
 */
export function initRenewalSchedulers(): void {
  // 获取所有标记为 renewal 的提供商类型
  const renewalTypes = new Set(
    getProviderDefinitions()
      .filter(def => def.capabilities.renewal)
      .map(def => def.type),
  );
  log.debug('Providers with renewal capability', { types: [...renewalTypes] });

  // 注册匹配的调度器
  for (const scheduler of renewalSchedulers) {
    if (renewalTypes.has(scheduler.type)) {
      renewalRegistry.register(scheduler);
    } else {
      log.warn(`Scheduler for "${scheduler.type}" exists but capabilities.renewal is not set in registry`);
    }
  }

  // 检查是否有 capability 标记了但未找到调度器
  const registeredTypes = renewalRegistry.getRegisteredTypes();
  const missedTypes = [...renewalTypes].filter(t => !registeredTypes.includes(t));
  if (missedTypes.length > 0) {
    log.warn('Providers with renewal:true but no scheduler found', { types: missedTypes });
  }

  log.info(`Registered renewal schedulers for: ${registeredTypes.join(', ')}`);
}