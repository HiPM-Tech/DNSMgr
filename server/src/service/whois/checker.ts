/**
 * WHOIS 域名检查器
 * 
 * 负责单个域名的 WHOIS 查询、缓存管理和状态提取
 */

import { WhoisOperations, DnsAccountOperations } from '../../db/business-adapter';
import { Domain, DnsAccount } from '../../types';
import { log } from '../../lib/logger';
import { queryWhois, getRootDomain, getCachedWhois, setCachedWhois, extractStatus, dnsProviderAdapter, WhoisResult } from './index';
import { areDomainsEqual } from '../../utils/dns';

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
 * 尝试从 DNS 提供商 API 获取域名到期时间
 */
async function getExpiryFromProvider(domainName: string): Promise<Date | null> {
  try {
    // 直接查询指定域名的记录，而不是遍历所有域名
    const { DomainOperations } = await import('../../db/business-adapter');
    const domain = await DomainOperations.getByName(domainName) as Domain | undefined;
    
    if (!domain || !domain.account_id) {
      log.debug('WhoisChecker', `Domain ${domainName} not found or has no account_id`);
      return null;
    }

    const account = await DnsAccountOperations.getById(domain.account_id) as DnsAccount | undefined;
    if (!account) {
      log.debug('WhoisChecker', `Account ${domain.account_id} not found for domain ${domainName}`);
      return null;
    }

    // Check if the DNS account is enabled before querying provider API
    if (!account.enabled) {
      log.debug('WhoisChecker', `DNS account ${account.id} (${account.name}) is disabled, skipping provider WHOIS for ${domainName}`);
      return null;
    }

    log.info('WhoisChecker', `Querying provider ${account.type} for domain ${domainName}`);

    // 检查是否有注册的 WHOIS 适配器
    const scheduler = dnsProviderAdapter.getAdapter(account.type);
    if (!scheduler) {
      log.debug('WhoisChecker', `No WHOIS adapter registered for provider ${account.type}`);
      return null;
    }

    // account.config 可能是字符串或对象，安全解析
    const config = typeof account.config === 'string' 
      ? JSON.parse(account.config) 
      : account.config;
    
    log.info('WhoisChecker', `Calling ${account.type.toUpperCase()} WHOIS for ${domainName}`);
    const whoisResult = await scheduler.queryWhois(config, domainName);
    
    if (whoisResult?.success && whoisResult.expiration_date) {
      const expiryDate = new Date(whoisResult.expiration_date);
      if (!isNaN(expiryDate.getTime())) {
        log.info('WhoisChecker', `${account.type.toUpperCase()} returned expiry for ${domainName}: ${expiryDate.toISOString()}`);
        return expiryDate;
      }
    }
    
    log.debug('WhoisChecker', `${account.type.toUpperCase()} query failed or no expiration_date for ${domainName}`);
    return null;
  } catch (error) {
    log.error('WhoisChecker', `Failed to get expiry from provider for ${domainName}:`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * 检查单个域名的 WHOIS
 * @param domainName 域名
 * @param forceRefresh 是否强制刷新（无视缓存）
 */
export async function checkWhoisForDomain(domainName: string, forceRefresh: boolean = false): Promise<WhoisCheckResult> {
  let whoisStatus: string | null = null;
  
  try {
    log.info('WhoisChecker', `Checking WHOIS for ${domainName}`, { forceRefresh });
    
    // 如果不是强制刷新，先尝试从 DNS 提供商获取（优先于缓存）
    if (!forceRefresh) {
      const providerExpiryDate = await getExpiryFromProvider(domainName);
      
      if (providerExpiryDate) {
        // DNS 提供商查询成功，使用提供商数据
        log.info('WhoisChecker', `Using provider expiry for ${domainName}: ${providerExpiryDate.toISOString()}`);
        
        // 仍然查询 WHOIS 获取状态等信息
        const whoisResult = await queryWhois(domainName);
        if (whoisResult?.raw) {
          whoisStatus = extractStatus(whoisResult.raw);
        }
        
        // 判断是否为顶域
        const rootDomain = getRootDomain(domainName);
        const isApexDomain = domainName.toLowerCase() === rootDomain.toLowerCase();
        
        let finalApexExpiryDate: Date | null = null;
        if (!isApexDomain && whoisResult?.expiryDate) {
          // 子域：同时保存顶域到期时间
          finalApexExpiryDate = whoisResult.expiryDate;
        }
        
        const result: WhoisResult = {
          domain: domainName,
          expiryDate: providerExpiryDate,
          apexExpiryDate: finalApexExpiryDate,
          registrar: whoisResult?.registrar || null,
          nameServers: whoisResult?.nameServers || [],
          raw: whoisResult?.raw || '',
          status: whoisStatus,
        };
        setCachedWhois(domainName, result);
        
        return {
          expiryDate: providerExpiryDate,
          apexExpiryDate: finalApexExpiryDate,
          registrar: whoisResult?.registrar || null,
          nameServers: whoisResult?.nameServers || [],
          status: whoisStatus,
        };
      }
      
      // DNS 提供商查询失败，尝试使用缓存
      log.info('WhoisChecker', `Provider query failed, trying cache for ${domainName}`);
      const cached = await getCachedWhois(domainName);
      if (cached?.expiryDate) {
        log.info('WhoisChecker', `Using cached expiry for ${domainName}: ${cached.expiryDate.toISOString()}`);
      
        // 如果缓存中没有 status，尝试从 raw_data 中解析
        whoisStatus = cached.status || null;
        if (!whoisStatus && cached.raw) {
          whoisStatus = extractStatus(cached.raw);
          if (whoisStatus) {
            log.info('WhoisChecker', `Parsed status from cache for ${domainName}: ${whoisStatus}`);
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
      log.info('WhoisChecker', `Force refresh mode, skipping cache for ${domainName}`);
    }

    // 使用 WHOIS 查询（缓存也失败时）
    log.info('WhoisChecker', `Querying WHOIS for ${domainName}`);
    const whoisResult = await queryWhois(domainName);

    // 提取 WHOIS 状态信息
    if (whoisResult?.raw) {
      whoisStatus = extractStatus(whoisResult.raw);
      if (whoisStatus) {
        log.info('WhoisChecker', `Extracted status for ${domainName}: ${whoisStatus}`);
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

    log.warn('WhoisChecker', `No expiry date found for ${domainName}`);
  } catch (error) {
    log.error('WhoisChecker', `Error checking ${domainName}:`, {
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
