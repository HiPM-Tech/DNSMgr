/**
 * NS Record Lookup Utility
 * NS 记录查询工具
 */

import { promises as dns } from 'dns';
import { log } from '../logger';

// 公共 DNS 服务器列表（作为备选）
const PUBLIC_DNS_SERVERS = [
  '8.8.8.8',      // Google DNS
  '8.8.4.4',      // Google DNS Secondary
  '1.1.1.1',      // Cloudflare DNS
  '1.0.0.1',      // Cloudflare DNS Secondary
  '223.5.5.5',    // AliDNS
  '223.6.6.6',    // AliDNS Secondary
];

// 查询超时时间（毫秒）
const DNS_TIMEOUT = 8000;

// 单次 resolver 重试次数
const RESOLVER_RETRIES = 1;

/**
 * 带超时的 Promise 包装器
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * 使用指定 DNS 服务器解析 NS 记录
 * @param domain 域名
 * @param dnsServer DNS 服务器地址
 * @returns NS 记录列表
 */
async function resolveNsWithServer(domain: string, dnsServer: string): Promise<string[]> {
  const resolver = new dns.Resolver();

  try {
    resolver.setServers([dnsServer]);

    const nsRecords = await withTimeout(
      resolver.resolveNs(domain),
      DNS_TIMEOUT,
      `DNS query to ${dnsServer}`
    );

    return nsRecords;
  } finally {
    // 确保 resolver 资源被释放
    try {
      resolver.cancel();
    } catch {
      // ignore cancel errors
    }
  }
}

/**
 * 解析域名的 NS 记录
 * 优先使用系统默认 DNS，失败时尝试公共 DNS 服务器
 * @param domain 域名
 * @returns NS 记录列表
 */
export async function resolveNsRecords(domain: string): Promise<string[]> {
  // 移除可能的尾部点号并转为小写
  const normalizedDomain = domain.replace(/\.$/, '').toLowerCase();

  if (!normalizedDomain || normalizedDomain.includes(' ')) {
    log.warn('NSLookup', 'Invalid domain provided', { domain });
    return [];
  }

  // 首先尝试系统默认 DNS
  try {
    const nsRecords = await withTimeout(
      dns.resolveNs(normalizedDomain),
      DNS_TIMEOUT,
      'System DNS query'
    );

    if (nsRecords && nsRecords.length > 0) {
      const uniqueNs = [...new Set(nsRecords.map(ns => ns.toLowerCase()))].sort();
      log.info('NSLookup', 'NS records resolved (system DNS)', {
        domain: normalizedDomain,
        count: uniqueNs.length,
        servers: uniqueNs,
      });
      return uniqueNs;
    }
  } catch (error) {
    const errCode = (error as NodeJS.ErrnoException).code;
    log.warn('NSLookup', 'System DNS resolution failed, trying public DNS', {
      domain: normalizedDomain,
      errorCode: errCode,
      errorMessage: (error as Error).message,
    });
  }

  // 系统 DNS 失败，尝试公共 DNS 服务器
  for (const dnsServer of PUBLIC_DNS_SERVERS) {
    for (let attempt = 0; attempt <= RESOLVER_RETRIES; attempt++) {
      try {
        const nsRecords = await resolveNsWithServer(normalizedDomain, dnsServer);

        if (nsRecords && nsRecords.length > 0) {
          const uniqueNs = [...new Set(nsRecords.map(ns => ns.toLowerCase()))].sort();
          log.info('NSLookup', 'NS records resolved (public DNS)', {
            domain: normalizedDomain,
            dnsServer,
            attempt: attempt + 1,
            count: uniqueNs.length,
            servers: uniqueNs,
          });
          return uniqueNs;
        }
      } catch (error) {
        const errCode = (error as NodeJS.ErrnoException).code;
        log.warn('NSLookup', 'Public DNS resolution failed', {
          domain: normalizedDomain,
          dnsServer,
          attempt: attempt + 1,
          errorCode: errCode,
          errorMessage: (error as Error).message,
        });
      }
    }
  }

  // 所有 DNS 服务器都失败
  log.error('NSLookup', 'Failed to resolve NS records from all DNS servers', {
    domain: normalizedDomain,
    triedServers: ['system', ...PUBLIC_DNS_SERVERS],
  });

  return [];
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

  // 统一转为小写后比较
  const currentLower = current.map(ns => ns.toLowerCase());
  const expectedLower = expected.map(ns => ns.toLowerCase());

  // 检查所有预期的 NS 是否都在当前记录中
  return expectedLower.every(ns => currentLower.includes(ns));
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
