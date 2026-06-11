export { CloudflareAdapter } from './cloudflare';
export { AliyunAdapter } from './aliyun';
export { DnspodAdapter } from './dnspod';
export { TencenteoAdapter } from './tencenteo';
export { DnsheAdapter } from './dnshe';
export {
  buildAuthHeaders as dnsheBuildAuthHeaders,
  authenticatedRequest as dnsheAuthenticatedRequest,
  validateCredentials as dnsheValidateCredentials,
  renewSubdomain as dnsheRenewSubdomain,
  getWhois as dnsheGetWhois,
  DnsheRenewalScheduler,
  dnsheRenewalScheduler,
  DnsheWhoisScheduler,
  dnsheWhoisScheduler,
  type DnsheAuthConfig,
  type DnsheRenewalResult,
  type DnsheWhoisResult,
} from './dnshe/index';
export { RainyunAdapter } from './rainyun';
export { WestAdapter } from './west';
export { AliyunesaAdapter } from './aliyunesa';
export { BaiduAdapter } from './baidu';
export { HuaweiAdapter } from './huawei';
export { NamesiloAdapter } from './namesilo';
export { BtAdapter } from './bt';
export { DnslaAdapter } from './dnsla';
export { HuoshanAdapter } from './huoshan';
export { JdcloudAdapter } from './jdcloud';
export { PowerdnsAdapter } from './powerdns';
export { QingcloudAdapter } from './qingcloud';
export { SpaceshipAdapter } from './spaceship';
export { HiDNSAdapter } from './hidns';
export { CaihongDnsAdapter } from './caihongdns';
export { Vps8Adapter } from './vps8';
export { GcoreAdapter } from './gcore';
export { DnsnekoAdapter } from './dnsneko';

// ========== WHOIS 调度器自动汇集 ==========
// 约定：每个支持 WHOIS 的 DNS 提供商模块导出 whoisScheduler，
// 在此加入 whoisSchedulers 数组即可实现 WHOIS 模块自动注册。
// WHOIS 模块通过 importWhoisSchedulers() 统一导入，无需逐个感知。

import { dnsheWhoisScheduler } from './dnshe';

/** 所有 DNS 提供商的 WHOIS 调度器列表 */
export const whoisSchedulers = [
  dnsheWhoisScheduler,
  // 新增 WHOIS 支持时在此追加，例如：
  // whoisScheduler as gcoreWhoisScheduler from './gcore',
];
