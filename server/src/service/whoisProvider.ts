/**
 * WHOIS Provider 抽象层
 * 支持多源查询：whoiser / RDAP / 直连 WHOIS 服务器
 */

import { whoisDomain, firstResult } from 'whoiser';
import { log } from '../lib/logger';

export interface WhoisResult {
  domain: string;
  expiryDate: Date | null;
  registrar: string | null;
  nameServers: string[];
  raw: any;
}

interface WhoisProvider {
  name: string;
  query(domain: string): Promise<WhoisResult | null>;
}

// 更全面的特殊后缀列表
const SPECIAL_SUFFIXES = [
  // 中国
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'mil.cn',
  // 英国
  'co.uk', 'org.uk', 'net.uk', 'gov.uk', 'ac.uk', 'me.uk',
  // 澳大利亚
  'com.au', 'net.au', 'org.au', 'gov.au', 'edu.au',
  // 日本
  'co.jp', 'ne.jp', 'or.jp', 'go.jp', 'ac.jp',
  // 新加坡
  'com.sg', 'net.sg', 'org.sg', 'gov.sg', 'edu.sg',
  // 香港
  'com.hk', 'net.hk', 'org.hk', 'gov.hk', 'edu.hk',
  // 台湾
  'com.tw', 'net.tw', 'org.tw', 'gov.tw', 'edu.tw',
  // 韩国
  'co.kr', 'ne.kr', 'or.kr', 'go.kr', 'ac.kr',
  // 其他
  'com.br', 'com.mx', 'co.nz', 'co.za', 'co.il', 'co.th',
];

/**
 * 获取根域名（注册域名）
 */
export function getRootDomain(domainName: string): string {
  const parts = domainName.toLowerCase().split('.');
  
  if (parts.length <= 2) return domainName;
  
  const lastTwo = parts.slice(-2).join('.');
  const lastThree = parts.slice(-3).join('.');
  
  // 检查是否匹配三级后缀（如 example.co.uk）
  if (SPECIAL_SUFFIXES.includes(lastTwo)) {
    // 返回最后三部分
    return parts.slice(-3).join('.');
  }
  
  // 检查是否匹配四级后缀（如 example.com.au 实际上是 example.com.au）
  if (parts.length >= 3 && SPECIAL_SUFFIXES.includes(lastThree)) {
    // 如果匹配 com.au 这类后缀，需要返回最后四部分
    if (parts.length >= 4) {
      return parts.slice(-4).join('.');
    }
    return lastThree;
  }
  
  // 标准后缀，返回最后两部分
  return lastTwo;
}

/**
 * 解析各种日期格式
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  // 尝试直接解析
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  
  // 处理自定义格式
  const formats = [
    // ISO 8601 variants
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/,
    // 标准日期
    /^(\d{4})-(\d{2})-(\d{2})/,
    /^(\d{4})\/(\d{2})\/(\d{2})/,
    // 欧洲格式
    /^(\d{2})\/(\d{2})\/(\d{4})/,
    /^(\d{2})\.(\d{2})\.(\d{4})/,
    // 带时区的格式
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2}|Z)?/,
    // 无分隔符
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
  ];
  
  for (const regex of formats) {
    const match = dateStr.match(regex);
    if (match) {
      // 根据匹配结果构造日期
      try {
        if (match[4] && match[5] && match[6]) {
          // 带时间的格式
          d = new Date(
            parseInt(match[1]),
            parseInt(match[2]) - 1,
            parseInt(match[3]),
            parseInt(match[4]),
            parseInt(match[5]),
            parseInt(match[6])
          );
        } else {
          // 只有日期的格式
          d = new Date(
            parseInt(match[1]),
            parseInt(match[2]) - 1,
            parseInt(match[3])
          );
        }
        if (!isNaN(d.getTime())) return d;
      } catch {
        // 继续尝试其他格式
      }
    }
  }
  
  return null;
}

/**
 * 从 WHOIS 结果中提取到期日期
 */
function extractExpiryDate(whoisData: any): Date | null {
  if (!whoisData) return null;
  
  const possibleKeys = [
    'Registry Expiry Date',
    'Expiry Date',
    'Registrar Registration Expiration Date',
    'Expiration Date',
    'expires',
    'Expiration Time',
    'paid-till',
    'Renewal Date',
    'Domain Expiration Date',
    'Expire Date',
    'Expiry',
    'Valid Until',
    'Valid-Until',
    'validUntil',
  ];
  
  for (const key of possibleKeys) {
    const value = whoisData[key];
    if (value) {
      const date = parseDate(value);
      if (date) {
        log.debug('WhoisProvider', `Found expiry using key "${key}": ${date.toISOString()}`);
        return date;
      }
    }
  }
  
  return null;
}

/**
 * Whoiser Provider（主要查询方式）
 */
class WhoiserProvider implements WhoisProvider {
  name = 'whoiser';
  
  async query(domain: string): Promise<WhoisResult | null> {
    try {
      const result = await whoisDomain(domain, { follow: 1 });
      const firstFound = firstResult(result) as any;
      
      if (!firstFound) {
        log.debug('WhoisProvider', `Whoiser: No result for ${domain}`);
        return null;
      }
      
      const expiryDate = extractExpiryDate(firstFound);
      
      return {
        domain,
        expiryDate,
        registrar: firstFound.Registrar || firstFound['Sponsoring Registrar'] || null,
        nameServers: extractNameServers(firstFound),
        raw: firstFound,
      };
    } catch (error) {
      log.debug('WhoisProvider', `Whoiser error for ${domain}:`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null;
    }
  }
}

/**
 * RDAP Provider（备用查询方式）
 * RDAP 是 WHOIS 的 JSON 替代协议，更现代化
 */
class RdapProvider implements WhoisProvider {
  name = 'rdap';
  
  // RDAP 基础 URL 映射
  private getRdapUrl(domain: string): string | null {
    const tld = domain.split('.').pop()?.toLowerCase();
    if (!tld) return null;
    
    // 常见的 RDAP 服务器
    const rdapServers: Record<string, string> = {
      'com': 'https://rdap.verisign.com/com/v1/',
      'net': 'https://rdap.verisign.com/net/v1/',
      'org': 'https://rdap.publicinterestregistry.org/rdap/org/',
      'info': 'https://rdap.publicinterestregistry.org/rdap/info/',
      'io': 'https://rdap.nic.io/',
      'app': 'https://rdap.nic.google/',
      'dev': 'https://rdap.nic.google/',
      'page': 'https://rdap.nic.google/',
      'cloud': 'https://rdap.nic.cloud/',
      'ai': 'https://rdap.whois.ai/',
      'ng': 'https://rdap.nic.net.ng/',
      'uk': 'https://rdap.nic.uk/',
    };
    
    return rdapServers[tld] || null;
  }
  
  async query(domain: string): Promise<WhoisResult | null> {
    const baseUrl = this.getRdapUrl(domain);
    if (!baseUrl) {
      log.debug('WhoisProvider', `RDAP: No server for TLD of ${domain}`);
      return null;
    }
    
    try {
      const url = `${baseUrl}domain/${domain}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/rdap+json' },
        signal: AbortSignal.timeout(10000),
      });
      
      if (!response.ok) {
        log.debug('WhoisProvider', `RDAP: HTTP ${response.status} for ${domain}`);
        return null;
      }
      
      const data = await response.json();
      
      // 解析 RDAP 响应
      let expiryDate: Date | null = null;
      let registrar: string | null = null;
      
      if (data.events) {
        const expirationEvent = data.events.find((e: any) => 
          e.eventAction === 'expiration' || e.eventAction === 'registration expiration'
        );
        if (expirationEvent?.eventDate) {
          expiryDate = parseDate(expirationEvent.eventDate);
        }
      }
      
      if (data.entities) {
        const registrarEntity = data.entities.find((e: any) => 
          e.roles?.includes('registrar')
        );
        if (registrarEntity?.vcardArray) {
          const org = registrarEntity.vcardArray.find((v: any) => v[0] === 'org');
          if (org) registrar = org[3];
        }
      }
      
      return {
        domain,
        expiryDate,
        registrar,
        nameServers: data.nameservers?.map((n: any) => n.ldhName) || [],
        raw: data,
      };
    } catch (error) {
      log.debug('WhoisProvider', `RDAP error for ${domain}:`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null;
    }
  }
}

/**
 * 提取域名服务器
 */
function extractNameServers(whoisData: any): string[] {
  const ns: string[] = [];
  
  // 尝试各种可能的字段名
  const nsKeys = ['Name Server', 'Name Servers', 'nserver', 'NS'];
  
  for (const key of nsKeys) {
    const value = whoisData[key];
    if (value) {
      if (Array.isArray(value)) {
        ns.push(...value);
      } else if (typeof value === 'string') {
        ns.push(value);
      }
    }
  }
  
  return ns.filter(n => n).map(n => n.toLowerCase().trim());
}

// 创建 Provider 实例
const providers: WhoisProvider[] = [
  new WhoiserProvider(),
  new RdapProvider(),
];

/**
 * 查询域名 WHOIS 信息
 * 依次尝试所有 Provider，直到获取到结果
 */
export async function queryWhois(domain: string): Promise<WhoisResult | null> {
  const rootDomain = getRootDomain(domain);
  
  if (rootDomain !== domain) {
    log.debug('WhoisProvider', `Querying root domain ${rootDomain} for ${domain}`);
  }
  
  for (const provider of providers) {
    try {
      const result = await provider.query(rootDomain);
      if (result && result.expiryDate) {
        log.info('WhoisProvider', `Got expiry for ${domain} via ${provider.name}: ${result.expiryDate.toISOString()}`);
        return result;
      }
    } catch (error) {
      log.debug('WhoisProvider', `Provider ${provider.name} failed for ${domain}:`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
  
  log.warn('WhoisProvider', `All providers failed for ${domain}`);
  return null;
}
