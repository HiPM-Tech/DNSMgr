/**
 * WHOIS 域名检查器
 *
 * 负责单个域名的 WHOIS 查询、缓存管理和状态提取
 *
 * 查询优先级由 WhoisLookup 统一管理：
 *   顶域：RDAP → WHOIS → DNS Provider → 第三方
 *   子域：DNS Provider → RDAP → WHOIS → 第三方
 */

import { WhoisOperations } from '../../db/bal/business-adapter';
import { Domain } from '../../types';
import { createLogger } from '../../lib/logger';
import { queryWhois } from './lookup';
import { getCachedWhois, setCachedWhois } from './cache';
import { extractStatus } from './data-parser';
import { WhoisResult } from './types';

const log = createLogger('WhoisService').sub('Checker');
/**
 * WHOIS 检查结果
 */
export interface WhoisCheckResult {
  expiryDate: Date | null;
  apexExpiryDate: Date | null;
  registrar: string | null;
  nameServers: string[];
  status?: string | null;
}

/**
 * 将日期格式化为 MySQL 兼容的格式 (YYYY-MM-DD HH:mm:ss)
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
 * 检查单个域名的 WHOIS
 * @param domainName 域名
 * @param forceRefresh 是否强制刷新（无视缓存）
 */
export async function checkWhoisForDomain(domainName: string, forceRefresh: boolean = false): Promise<WhoisCheckResult> {
  let whoisStatus: string | null = null;

  try {
    log.info(`Checking WHOIS for ${domainName}`, { forceRefresh });

    // 非强制刷新时，优先使用数据库缓存
    if (!forceRefresh) {
      const cached = await getCachedWhois(domainName);
      if (cached?.expiryDate) {
        log.info(`Using cached expiry for ${domainName}: ${cached.expiryDate.toISOString()}`);

        // 如果缓存中没有 status，尝试从 raw_data 中解析
        whoisStatus = cached.status || null;
        if (!whoisStatus && cached.raw) {
          whoisStatus = extractStatus(cached.raw);
          if (whoisStatus) {
            log.info(`Parsed status from cache for ${domainName}: ${whoisStatus}`);
          }
        }

        return {
          expiryDate: cached.expiryDate,
          apexExpiryDate: cached.apexExpiryDate || null,
          registrar: cached.registrar,
          nameServers: cached.nameServers,
          status: whoisStatus,
        };
      }
    } else {
      log.info(`Force refresh mode, skipping cache for ${domainName}`);
    }

    // 走 WhoisLookup 统一查询链（DNS Provider → RDAP → WHOIS → 第三方）
    log.info(`Querying WHOIS for ${domainName}`);
    const whoisResult = await queryWhois(domainName);

    // 提取 WHOIS 状态信息
    if (whoisResult?.raw) {
      whoisStatus = extractStatus(whoisResult.raw);
      if (whoisStatus) {
        log.info(`Extracted status for ${domainName}: ${whoisStatus}`);
      }
    }

    if (whoisResult?.expiryDate) {
      const result: WhoisResult = {
        domain: domainName,
        expiryDate: whoisResult.expiryDate,
        apexExpiryDate: whoisResult.apexExpiryDate || null,
        registrar: whoisResult.registrar || null,
        nameServers: whoisResult.nameServers || [],
        raw: whoisResult.raw || '',
        status: whoisStatus,
      };
      setCachedWhois(domainName, result);

      return {
        expiryDate: whoisResult.expiryDate,
        apexExpiryDate: whoisResult.apexExpiryDate || null,
        registrar: whoisResult.registrar || null,
        nameServers: whoisResult.nameServers || [],
        status: whoisStatus,
      };
    }

    log.warn(`No expiry date found for ${domainName}`);
  } catch (error) {
    log.error(`Error checking ${domainName}:`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    expiryDate: null,
    apexExpiryDate: null,
    registrar: null,
    nameServers: [],
    status: whoisStatus,
  };
}

/**
 * 立即同步单个域名的 WHOIS
 * @param domainId 域名ID
 * @param forceRefresh 是否强制刷新（无视缓存）
 */
export async function syncDomainWhois(domainId: number, forceRefresh: boolean = false): Promise<{ success: boolean; expiresAt: Date | null; apexExpiresAt?: Date | null; message?: string }> {
  try {
    const domain = await WhoisOperations.getDomainById(domainId) as Domain | undefined;

    if (!domain) {
      return { success: false, expiresAt: null, message: 'Domain not found' };
    }

    const whoisResult = await checkWhoisForDomain(domain.name, forceRefresh);

    if (whoisResult.expiryDate) {
      const formattedDate = formatDateForMySQL(whoisResult.expiryDate);
      const formattedApexDate = whoisResult.apexExpiryDate
        ? formatDateForMySQL(whoisResult.apexExpiryDate)
        : null;
      await WhoisOperations.updateExpiry(domainId, formattedDate, formattedApexDate, whoisResult.status);

      return {
        success: true,
        expiresAt: whoisResult.expiryDate,
        apexExpiresAt: whoisResult.apexExpiryDate,
      };
    }

    return { success: false, expiresAt: null, message: 'Could not retrieve expiry date' };
  } catch (error) {
    return {
      success: false,
      expiresAt: null,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}