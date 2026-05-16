/**
 * WHOIS 域名检查器
 * 
 * 负责单个域名的 WHOIS 查询、缓存管理和状态提取
 */

import { WhoisOperations, DnsAccountOperations } from '../../db/business-adapter';
import { Domain, DnsAccount } from '../../types';
import { log } from '../../lib/logger';
import { queryWhois, getRootDomain, getCachedWhois, setCachedWhois, extractStatusFromRaw, WhoisResult, whoisRegistry } from './index';
import { createAdapter } from '../../lib/dns/DnsHelper';
import { areDomainsEqual } from '../../utils/domain';

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
    const allDomains = await WhoisOperations.getAllDomains() as unknown as Domain[];
    const domain = allDomains.find(d => areDomainsEqual(d.name as string, domainName));
    
    if (!domain || !domain.account_id) {
      return null;
    }

    const account = await DnsAccountOperations.getById(domain.account_id) as DnsAccount | undefined;
    if (!account) {
      return null;
    }

    // 排除不准确的提供商
    const excludedProviders = ['caihongdns', 'hidns'];
    if (excludedProviders.includes(account.type)) {
      return null;
    }

    // DNSHE 特殊处理
    if (account.type === 'dnshe') {
      const scheduler = whoisRegistry.getScheduler('dnshe');
      if (!scheduler) {
        return null;
      }

      const config = JSON.parse(account.config);
      const whoisResult = await scheduler.queryWhois(config, domainName);
      
      if (whoisResult?.success && whoisResult.expiration_date) {
        const expiryDate = new Date(whoisResult.expiration_date);
        if (!isNaN(expiryDate.getTime())) {
          return expiryDate;
        }
      }
      
      return null;
    }

    // 其他提供商
    const config = JSON.parse(account.config);
    const adapter = createAdapter(account.type, config, domainName);
    const domainList = await adapter.getDomainList();
    const domainInfo = domainList.list.find((d: any) => d.Domain.toLowerCase() === domainName.toLowerCase());
    
    if (domainInfo?.ExpiresAt) {
      const expiryDate = new Date(domainInfo.ExpiresAt);
      if (!isNaN(expiryDate.getTime())) {
        return expiryDate;
      }
    }

    return null;
  } catch (error) {
    log.debug('WhoisChecker', `Failed to get expiry from provider for ${domainName}`);
    return null;
  }
}

/**
 * 检查单个域名的 WHOIS
 */
export async function checkWhoisForDomain(domainName: string): Promise<WhoisCheckResult> {
  let whoisStatus: string | null = null;
  
  try {
    log.info('WhoisChecker', `Checking WHOIS for ${domainName}`);
    
    // 检查数据库缓存
    const cached = await getCachedWhois(domainName);
    if (cached?.expiryDate) {
      log.info('WhoisChecker', `Using cached expiry for ${domainName}: ${cached.expiryDate.toISOString()}`);
      
      // 如果缓存中没有 status，尝试从 raw_data 中解析
      whoisStatus = cached.status || null;
      if (!whoisStatus && cached.raw) {
        whoisStatus = extractStatusFromRaw(cached.raw);
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

    // 使用 WHOIS 查询
    log.info('WhoisChecker', `Querying WHOIS for ${domainName}`);
    const whoisResult = await queryWhois(domainName);

    // 提取 WHOIS 状态信息
    if (whoisResult?.raw) {
      whoisStatus = extractStatusFromRaw(whoisResult.raw);
      if (whoisStatus) {
        log.info('WhoisChecker', `Extracted status for ${domainName}: ${whoisStatus}`);
      }
    }

    // 尝试从 DNS 提供商 API 获取到期时间
    const providerExpiryDate = await getExpiryFromProvider(domainName);

    // 判断是否为顶域
    const rootDomain = getRootDomain(domainName);
    const isApexDomain = domainName.toLowerCase() === rootDomain.toLowerCase();

    let finalExpiryDate: Date | null = null;
    let finalApexExpiryDate: Date | null = whoisResult?.apexExpiryDate || null;

    if (isApexDomain) {
      // 顶域：顶域 WHOIS > DNS 提供商 API
      if (whoisResult?.expiryDate) {
        finalExpiryDate = whoisResult.expiryDate;
      } else if (providerExpiryDate) {
        finalExpiryDate = providerExpiryDate;
      }
    } else {
      // 子域：DNS 提供商 API > 顶域 WHOIS
      if (providerExpiryDate) {
        finalExpiryDate = providerExpiryDate;
      } else if (whoisResult?.expiryDate) {
        finalExpiryDate = whoisResult.expiryDate;
      }
    }

    if (finalExpiryDate) {
      const result: WhoisResult = {
        domain: domainName,
        expiryDate: finalExpiryDate,
        apexExpiryDate: finalApexExpiryDate,
        registrar: whoisResult?.registrar || null,
        nameServers: whoisResult?.nameServers || [],
        raw: whoisResult?.raw || '',
        status: whoisStatus,
      };
      setCachedWhois(domainName, result);
      
      return {
        expiryDate: finalExpiryDate,
        apexExpiryDate: finalApexExpiryDate,
        registrar: whoisResult?.registrar || null,
        nameServers: whoisResult?.nameServers || [],
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
 */
export async function syncDomainWhois(domainId: number): Promise<{ success: boolean; expiresAt: Date | null; apexExpiresAt?: Date | null; message?: string }> {
  try {
    const domain = await WhoisOperations.getDomainById(domainId) as Domain | undefined;

    if (!domain) {
      return { success: false, expiresAt: null, message: 'Domain not found' };
    }

    const whoisResult = await checkWhoisForDomain(domain.name);

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
