/**
 * DNS 工具模块统一导出
 * 
 * 包含所有与域名处理相关的工具函数：
 * - IDN 国际化域名转换（Punycode ↔ Unicode）
 * - 域名验证和规范化
 * - 子域名和主机名处理
 */

export {
  // IDN 转换核心函数
  toPunycode,
  toUnicode,
  
  // 域名检测
  isUnicodeDomain,
  isPunycodeDomain,
  
  // 域名规范化
  normalizeDomain,
  sanitizeDomain,
  
  // 域名显示
  getDisplayDomain,
  
  // 域名比较
  areDomainsEqual,
  
  // 域名提取
  getRootDomain,
  extractSubdomain,
  
  // 域名验证
  isValidDomain,
  isValidSubdomain,
  isValidHostname,
} from './domain';

// 重新导出默认对象（可选，用于向后兼容）
export * as domainUtils from './domain';
