/**
 * WHOIS 缓存管理
 * 
 * 负责 WHOIS 结果的数据库缓存读写
 */

import { WhoisOperations } from '../../db/business-adapter';
import { log } from '../../lib/logger';
import { extractStatusFromRaw } from './status-parser';

// WHOIS 数据库缓存配置
const CACHE_TTL = 1 * 60 * 60 * 1000; // 1 小时
const CACHE_TTL_SECONDS = Math.floor(CACHE_TTL / 1000);

/**
 * WHOIS 查询结果
 */
export interface WhoisResult {
  domain: string;
  expiryDate: Date | null;
  apexExpiryDate?: Date | null;  // 可选，与 providers/base.ts 保持一致
  registrar: string | null;
  nameServers: string[];
  raw: string;
  status?: string | null;
}

/**
 * 格式化日期为 MySQL 兼容格式 (YYYY-MM-DD HH:mm:ss)
 */
function formatDateForMySQL(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 从数据库获取缓存的 WHOIS 结果
 */
export async function getCachedWhois(domain: string): Promise<WhoisResult | null> {
  try {
    const row = await WhoisOperations.getCachedWhois(domain, CACHE_TTL_SECONDS);
    
    if (row) {
      log.debug('WhoisCache', `Cache hit for ${domain}`);
      
      const cached: WhoisResult = {
        domain: (row as any).domain || domain,
        expiryDate: (row as any).expiry_date ? new Date((row as any).expiry_date) : null,
        apexExpiryDate: (row as any).apex_expiry_date ? new Date((row as any).apex_expiry_date) : null,
        registrar: (row as any).registrar || null,
        nameServers: (row as any).name_servers ? JSON.parse((row as any).name_servers) : [],
        raw: (row as any).raw_data || '',
        status: (row as any).status || null,
      };
      
      // 如果缓存中没有 status，尝试从 raw_data 中解析
      if (!cached.status && cached.raw) {
        cached.status = extractStatusFromRaw(cached.raw);
        if (cached.status) {
          log.info('WhoisCache', `Parsed status from cache for ${domain}: ${cached.status}`);
        }
      }
      
      return cached;
    }
    
    return null;
  } catch (error) {
    log.error('WhoisCache', 'Failed to get cached WHOIS', { domain, error });
    return null;
  }
}

/**
 * 将 WHOIS 结果缓存到数据库
 */
export async function setCachedWhois(domain: string, result: WhoisResult): Promise<void> {
  try {
    await WhoisOperations.setCachedWhois(
      domain,
      result.expiryDate ? formatDateForMySQL(result.expiryDate) : null,
      result.apexExpiryDate ? formatDateForMySQL(result.apexExpiryDate) : null,
      result.registrar || null,
      JSON.stringify(result.nameServers || []),
      result.raw || '',
      result.status || null
    );
    log.debug('WhoisCache', `Cached WHOIS result for ${domain}`, { status: result.status });
  } catch (error) {
    log.error('WhoisCache', 'Failed to cache WHOIS result', { domain, error });
  }
}
