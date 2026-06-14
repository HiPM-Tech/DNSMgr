/**
 * ⚠️ DigitalPlat Domains (dpdns) Provider Module — 逆向实现
 *
 * dpdns 使用 remember_token 认证（从浏览器 DevTools 获取），
 * 通过逆向 web 控制台 API 实现 free 域名续期功能。
 * 当前仅支持 free 配额的域名续期，不支持 DNS 记录管理。
 *
 * 模块组成：
 *   - Auth: Cookie 认证（remember_token）
 *   - Renewal: 域名列表查询 + free 续期
 *   - Scheduler: 续期调度器（实现 RenewalScheduler 接口）
 *   - Adapter: DnsAdapter 适配器（仅 check 方法有效）
 *
 * ⚠️ 未来规划：
 *   将添加 dodns 提供商（官方 API key 实现），届时 dpdns 与 dodns
 *   将作为两个独立的提供商同时注册在 registry.ts 中。
 *   - dpdns（当前）：remember_token 逆向实现，仅续期
 *   - dodns（未来）：官方 API key 实现，完整 DNS 管理 + 续期
 */

// 认证模块
export {
  authenticatedRequest,
  validateCredentials,
  type DpdnsAuthConfig,
} from './auth';

// 续期模块
export {
  listFreeDomains,
  renewFreeDomain,
  parseDpdnsDate,
  getDaysUntilExpiry,
  type DpdnsDomain,
} from './renewal';

// 续期调度器
export {
  DpdnsReverseRenewalScheduler,
  dpdnsReverseRenewalScheduler,
} from './scheduler';

// 适配器
export { DpdnsReverseAdapter } from './adapter';