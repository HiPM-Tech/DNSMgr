/**
 * 域名工具函数
 * 支持国际化域名(IDN)，包括中文域名
 */

import { normalizeDomain } from '../../utils/domain';

/**
 * 特殊后缀列表
 * 这些后缀需要特殊处理以正确识别根域名
 */
const SPECIAL_SUFFIXES = [
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'mil.cn',
  'co.uk', 'org.uk', 'net.uk', 'gov.uk', 'ac.uk', 'me.uk',
  'com.au', 'net.au', 'org.au', 'gov.au', 'edu.au',
  'co.jp', 'ne.jp', 'or.jp', 'go.jp', 'ac.jp',
  'com.sg', 'net.sg', 'org.sg', 'gov.sg', 'edu.sg',
  'com.hk', 'net.hk', 'org.hk', 'gov.hk', 'edu.hk',
  'com.tw', 'net.tw', 'org.tw', 'gov.tw', 'edu.tw',
  'co.kr', 'ne.kr', 'or.kr', 'go.kr', 'ac.kr',
  'com.br', 'com.mx', 'co.nz', 'co.za', 'co.il', 'co.th',
];

/**
 * 获取根域名（顶域）
 * 支持国际化域名(IDN)，包括中文域名
 * @param domainName 域名（支持 Unicode 或 Punycode 格式）
 * @returns 根域名（Punycode 格式）
 */
export function getRootDomain(domainName: string): string {
  // 使用 IDN-aware 归一化（将 Unicode 转换为 Punycode）
  const normalized = normalizeDomain(domainName);
  const parts = normalized.split('.');

  if (parts.length <= 2) return normalized;

  const lastTwo = parts.slice(-2).join('.');
  const lastThree = parts.slice(-3).join('.');

  // 检查是否匹配三级后缀
  if (SPECIAL_SUFFIXES.includes(lastTwo)) {
    return parts.slice(-3).join('.');
  }

  // 检查是否匹配四级后缀
  if (parts.length >= 3 && SPECIAL_SUFFIXES.includes(lastThree)) {
    if (parts.length >= 4) {
      return parts.slice(-4).join('.');
    }
    return lastThree;
  }

  // 标准后缀，返回最后两部分
  return lastTwo;
}
