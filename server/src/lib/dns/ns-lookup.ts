/**
 * NS Record Lookup Utility
 * NS 记录查询工具 - 使用新的 DNS 解析模块（支持 DNS 污染检测）
 */

import { dnsResolver, DNSQueryType, DNSResolverResult } from './resolver';
import { log } from '../logger';

// 查询超时时间（毫秒）
const DNS_TIMEOUT = 10000;

export interface NSLookupResult {
  nsRecords: string[];
  isPoisoned: boolean;
  encryptedResult?: DNSResolverResult;
  plainResult?: DNSResolverResult;
}

/**
 * 解析域名的 NS 记录（带 DNS 污染检测）
 * 同时使用加密 DNS 和明文 DNS 查询，检测是否被污染
 * @param domain 域名
 * @returns NS 查询结果（包含污染检测信息）
 */
export async function resolveNsRecords(domain: string): Promise<NSLookupResult> {
  // 移除可能的尾部点号并转为小写
  const normalizedDomain = domain.replace(/\.$/, '').toLowerCase();

  if (!normalizedDomain || normalizedDomain.includes(' ')) {
    log.warn('NSLookup', 'Invalid domain provided', { domain });
    return { nsRecords: [], isPoisoned: false };
  }

  try {
    // 使用双重查询（加密 + 明文）
    const validationResult = await dnsResolver.resolveNSWithValidation(normalizedDomain);

    if (validationResult.nsRecords.length > 0) {
      log.info('NSLookup', 'NS records resolved', {
        domain: normalizedDomain,
        count: validationResult.nsRecords.length,
        servers: validationResult.nsRecords,
        isPoisoned: validationResult.isPoisoned,
        encryptedSource: validationResult.encrypted.source,
        plainSource: validationResult.plain.source,
      });

      return {
        nsRecords: validationResult.nsRecords,
        isPoisoned: validationResult.isPoisoned,
        encryptedResult: validationResult.encrypted,
        plainResult: validationResult.plain,
      };
    }

    // 如果没有 NS 记录，尝试查询 A 记录（可能是子域名）
    log.debug('NSLookup', 'No NS records found, trying A record', {
      domain: normalizedDomain,
    });

    const aResult = await dnsResolver.resolve(normalizedDomain, DNSQueryType.A, {
      preferEncrypted: true,
      timeout: DNS_TIMEOUT,
      useProxy: true,
    });

    if (aResult.success && aResult.records && aResult.records.length > 0) {
      log.info('NSLookup', 'A records found (subdomain)', {
        domain: normalizedDomain,
        ips: aResult.records.map(r => r.data),
        source: aResult.source,
      });
      // 返回空数组表示这是一个子域名，没有 NS 记录
      return { nsRecords: [], isPoisoned: false };
    }
  } catch (error) {
    log.error('NSLookup', 'DNS resolution failed', {
      domain: normalizedDomain,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // 所有查询都失败
  log.error('NSLookup', 'Failed to resolve NS records', {
    domain: normalizedDomain,
  });

  return { nsRecords: [], isPoisoned: false };
}

/**
 * 仅获取 NS 记录（不包含污染检测信息）
 * @param domain 域名
 * @returns NS 记录列表
 */
export async function getNsRecordsOnly(domain: string): Promise<string[]> {
  const result = await resolveNsRecords(domain);
  return result.nsRecords;
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

  // 标准化函数：转小写并移除尾随点号
  const normalize = (ns: string): string => ns.toLowerCase().replace(/\.$/, '');

  // 标准化后排序比较（忽略顺序）
  const currentNormalized = current.map(normalize).sort();
  const expectedNormalized = expected.map(normalize).sort();

  // 双向验证：长度相同且所有元素相同
  if (currentNormalized.length !== expectedNormalized.length) {
    return false;
  }

  return currentNormalized.every((ns, index) => ns === expectedNormalized[index]);
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

/**
 * 批量解析多个域名的 NS 记录
 * @param domains 域名列表
 * @returns 域名到 NS 记录的映射
 */
export async function resolveNsRecordsBatch(domains: string[]): Promise<Map<string, NSLookupResult>> {
  const results = new Map<string, NSLookupResult>();

  // 并行解析所有域名
  const promises = domains.map(async (domain) => {
    const nsResult = await resolveNsRecords(domain);
    results.set(domain, nsResult);
  });

  await Promise.all(promises);

  const poisonedCount = Array.from(results.values()).filter(r => r.isPoisoned).length;

  log.info('NSLookup', 'Batch NS resolution completed', {
    total: domains.length,
    successful: Array.from(results.values()).filter(r => r.nsRecords.length > 0).length,
    poisoned: poisonedCount,
  });

  return results;
}

/**
 * 检查域名 NS 记录是否变更
 * @param domain 域名
 * @param previousNs 之前的 NS 记录
 * @returns 是否变更
 */
export async function checkNsChanged(domain: string, previousNs: string[]): Promise<boolean> {
  const currentResult = await resolveNsRecords(domain);
  const currentNs = currentResult.nsRecords;

  if (currentNs.length !== previousNs.length) {
    return true;
  }

  const currentSet = new Set(currentNs.map(ns => ns.toLowerCase()));
  const previousSet = new Set(previousNs.map(ns => ns.toLowerCase()));

  if (currentSet.size !== previousSet.size) {
    return true;
  }

  for (const ns of currentSet) {
    if (!previousSet.has(ns)) {
      return true;
    }
  }

  return false;
}
