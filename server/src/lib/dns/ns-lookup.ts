/**
 * NS Record Lookup Utility
 * NS 记录查询工具
 */

import { promises as dns } from 'dns';
import { log } from '../logger';

/**
 * 解析域名的 NS 记录
 * @param domain 域名
 * @returns NS 记录列表
 */
export async function resolveNsRecords(domain: string): Promise<string[]> {
  try {
    // 移除可能的尾部点号
    const normalizedDomain = domain.replace(/\.$/, '');

    const nsRecords = await dns.resolveNs(normalizedDomain);

    // 排序并去重
    const uniqueNs = [...new Set(nsRecords)].sort();

    log.info('NSLookup', 'NS records resolved', { domain: normalizedDomain, count: uniqueNs.length });

    return uniqueNs;
  } catch (error) {
    // 如果查询失败（如域名不存在或没有 NS 记录），返回空数组
    if ((error as NodeJS.ErrnoException).code === 'ENODATA' ||
        (error as NodeJS.ErrnoException).code === 'ENOTFOUND') {
      log.warn('NSLookup', 'No NS records found', { domain, error: (error as Error).message });
      return [];
    }

    log.error('NSLookup', 'Failed to resolve NS records', { domain, error });
    return [];
  }
}

/**
 * 验证 NS 记录是否匹配预期值
 * @param current 当前 NS 记录
 * @param expected 预期 NS 记录
 * @returns 是否匹配
 */
export function validateNsRecords(current: string[], expected: string[]): boolean {
  if (expected.length === 0) {
    // 如果没有预期值，只要有 NS 记录就算通过
    return current.length > 0;
  }

  // 检查所有预期的 NS 是否都在当前记录中
  return expected.every(ns => current.includes(ns));
}

/**
 * 获取 NS 记录变更状态
 * @param current 当前 NS 记录
 * @param expected 预期 NS 记录
 * @returns 状态: 'ok' | 'mismatch' | 'missing'
 */
export function getNsStatus(current: string[], expected: string[]): 'ok' | 'mismatch' | 'missing' {
  if (current.length === 0) {
    return 'missing';
  }

  if (expected.length > 0 && !validateNsRecords(current, expected)) {
    return 'mismatch';
  }

  return 'ok';
}
