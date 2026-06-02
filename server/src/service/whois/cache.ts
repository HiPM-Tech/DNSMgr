/**
 * WHOIS 缓存管理
 * 
 * 负责 WHOIS 结果的数据库缓存读写
 */

import { WhoisOperations } from '../../db/bal/business-adapter';
import { log } from '../../lib/logger';
import { extractStatus } from './data-parser';

// WHOIS 数据库缓存配置
const CACHE_TTL = 3 * 60 * 60 * 1000; // 3 小时
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
      
      let whoisData: Record<string, unknown> = {};
      try {
        const rawWhoisData = (row as any).whois_data;
        if (typeof rawWhoisData === 'string') {
          whoisData = JSON.parse(rawWhoisData);
        } else if (typeof rawWhoisData === 'object' && rawWhoisData !== null) {
          whoisData = rawWhoisData;
        }
      } catch {
        whoisData = {};
      }
      
      const cached: WhoisResult = {
        domain: domain,
        expiryDate: whoisData.expiryDate ? new Date(whoisData.expiryDate as string) : null,
        apexExpiryDate: whoisData.apexExpiryDate ? new Date(whoisData.apexExpiryDate as string) : null,
        registrar: (whoisData.registrar as string) || null,
        nameServers: Array.isArray(whoisData.nameServers) ? whoisData.nameServers as string[] : [],
        raw: (whoisData.raw as string) || '',
        status: (row as any).status || null,
      };
      
      // 如果缓存中没有 status，尝试从 raw_data 中解析
      if (!cached.status && cached.raw) {
        cached.status = extractStatus(cached.raw);
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
