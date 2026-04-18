/**
 * WHOIS Provider 抽象层
 * 支持多源查询：直连 WHOIS 服务器 / RDAP
 */

import * as net from 'net';
import { log } from '../lib/logger';

export interface WhoisResult {
  domain: string;
  expiryDate: Date | null;
  registrar: string | null;
  nameServers: string[];
  raw: string;
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

// WHOIS 服务器映射
const WHOIS_SERVERS: Record<string, string> = {
  'com': 'whois.verisign-grs.com',
  'net': 'whois.verisign-grs.com',
  'org': 'whois.publicinterestregistry.org',
  'info': 'whois.afilias.net',
  'biz': 'whois.biz',
  'us': 'whois.nic.us',
  'io': 'whois.nic.io',
  'co': 'whois.nic.co',
  'tv': 'whois.nic.tv',
  'cc': 'whois.nic.cc',
  'me': 'whois.nic.me',
  'mobi': 'whois.dotmobiregistry.net',
  'asia': 'whois.nic.asia',
  'name': 'whois.nic.name',
  'pro': 'whois.registrypro.pro',
  'aero': 'whois.aero',
  'museum': 'whois.museum',
  'jobs': 'whois.nic.jobs',
  'travel': 'whois.nic.travel',
  'xxx': 'whois.nic.xxx',
  // 国别域名
  'cn': 'whois.cnnic.cn',
  'uk': 'whois.nic.uk',
  'de': 'whois.denic.de',
  'fr': 'whois.nic.fr',
  'eu': 'whois.eu',
  'nl': 'whois.sidn.nl',
  'ru': 'whois.tcinet.ru',
  'br': 'whois.registro.br',
  'au': 'whois.auda.org.au',
  'jp': 'whois.jprs.jp',
  'kr': 'whois.kr',
  'tw': 'whois.twnic.net.tw',
  'hk': 'whois.hkirc.hk',
  'sg': 'whois.sgnic.sg',
  'in': 'whois.registry.in',
  'it': 'whois.nic.it',
  'pl': 'whois.dns.pl',
  'es': 'whois.nic.es',
  'ca': 'whois.cira.ca',
  'nz': 'whois.srs.net.nz',
  'za': 'whois.registry.net.za',
  'mx': 'whois.mx',
  'ar': 'whois.nic.ar',
  'cl': 'whois.nic.cl',
  // 新顶级域名
  'app': 'whois.nic.google',
  'dev': 'whois.nic.google',
  'page': 'whois.nic.google',
  'cloud': 'whois.nic.cloud',
  'blog': 'whois.nic.blog',
  'shop': 'whois.nic.shop',
  'site': 'whois.nic.site',
  'online': 'whois.nic.online',
  'website': 'whois.nic.website',
  'space': 'whois.nic.space',
  'store': 'whois.nic.store',
  'tech': 'whois.nic.tech',
  'xyz': 'whois.nic.xyz',
  'club': 'whois.nic.club',
  'live': 'whois.nic.live',
  'news': 'whois.nic.news',
  'video': 'whois.nic.video',
  'email': 'whois.nic.email',
  // 更多新顶级域名
  'top': 'whois.nic.top',
  'vip': 'whois.nic.vip',
  'work': 'whois.nic.work',
  'world': 'whois.nic.world',
  'wtf': 'whois.nic.wtf',
  'id': 'whois.id',
  'fm': 'whois.nic.fm',
  'ms': 'whois.nic.ms',
  'sh': 'whois.nic.sh',
  'ac': 'whois.nic.ac',
  'ro': 'whois.rotld.ro',
  'se': 'whois.iis.se',
  'ch': 'whois.nic.ch',
  'at': 'whois.nic.at',
  'be': 'whois.dns.be',
  'dk': 'whois.dk-hostmaster.dk',
  'fi': 'whois.fi',
  'no': 'whois.norid.no',
  'nu': 'whois.iis.nu',
  'ie': 'whois.weare.ie',
  'pt': 'whois.dns.pt',
  'gr': 'whois.gr',
  'hu': 'whois.nic.hu',
  'cz': 'whois.nic.cz',
  'sk': 'whois.sk-nic.sk',
  'lt': 'whois.domreg.lt',
  'lv': 'whois.nic.lv',
  'ee': 'whois.tld.ee',
  'ua': 'whois.ua',
  'su': 'whois.tcinet.ru',
  'by': 'whois.cctld.by',
  'md': 'whois.nic.md',
  'ge': 'whois.nic.ge',
  'am': 'whois.amnic.net',
  'az': 'whois.az',
  'kz': 'whois.nic.kz',
  'uz': 'whois.cctld.uz',
  'kg': 'whois.kg',
  'tj': 'whois.nic.tj',
  'tm': 'whois.nic.tm',
  'af': 'whois.nic.af',
  'pk': 'whois.pknic.net.pk',
  'bd': 'whois.btcl.net.bd',
  'lk': 'whois.nic.lk',
  'mm': 'whois.nic.mm',
  'kh': 'whois.nic.kh',
  'la': 'whois.nic.la',
  'vn': 'whois.vnnic.vn',
  'th': 'whois.thnic.co.th',
  'my': 'whois.mynic.my',
  'ph': 'whois.dot.ph',
  'np': 'whois.nic.np',
  'bt': 'whois.nic.bt',
  'mn': 'whois.nic.mn',
  // 国别域名 - 非洲
  'ci': 'whois.nic.ci',
  'cd': 'whois.nic.cd',
  'cm': 'whois.netcom.cm',
  'ga': 'whois.nic.ga',
  'ml': 'whois.nic.ml',
  'cf': 'whois.nic.cf',
  'td': 'whois.nic.td',
  'ne': 'whois.nic.ne',
  'tg': 'whois.nic.tg',
  'bj': 'whois.nic.bj',
  'sn': 'whois.nic.sn',
  'gm': 'whois.nic.gm',
  'gw': 'whois.nic.gw',
  'gn': 'whois.nic.gn',
  'sl': 'whois.nic.sl',
  'lr': 'whois.nic.lr',
  'ly': 'whois.nic.ly',
  'mr': 'whois.nic.mr',
  'eh': 'whois.nic.eh',
  'ma': 'whois.nic.ma',
  'dz': 'whois.nic.dz',
  'tn': 'whois.ati.tn',
  'eg': 'whois.egregistry.eg',
  'sd': 'whois.nic.sd',
  'ss': 'whois.nic.ss',
  'er': 'whois.nic.er',
  'dj': 'whois.nic.dj',
  'et': 'whois.nic.et',
  'so': 'whois.nic.so',
  'bi': 'whois.nic.bi',
  'rw': 'whois.nic.rw',
  'ug': 'whois.nic.ug',
  'ke': 'whois.kenic.or.ke',
  'tz': 'whois.nic.tz',
  'mw': 'whois.nic.mw',
  'zm': 'whois.nic.zm',
  'zw': 'whois.nic.zw',
  'mz': 'whois.nic.mz',
  'mg': 'whois.nic.mg',
  're': 'whois.nic.re',
  'yt': 'whois.nic.yt',
  'km': 'whois.nic.km',
  'sc': 'whois.nic.sc',
  'mu': 'whois.nic.mu',
  // 更多新顶级域名
  'today': 'whois.nic.today',
  'tokyo': 'whois.nic.tokyo',
  'tools': 'whois.nic.tools',
  'town': 'whois.nic.town',
  'toys': 'whois.nic.toys',
  'trade': 'whois.nic.trade',
  'trading': 'whois.nic.trading',
  'training': 'whois.nic.training',
  'tube': 'whois.nic.tube',
  'tires': 'whois.nic.tires',
  'tirol': 'whois.nic.tirol',
};

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
      try {
        if (match[4] && match[5] && match[6]) {
          d = new Date(
            parseInt(match[1]),
            parseInt(match[2]) - 1,
            parseInt(match[3]),
            parseInt(match[4]),
            parseInt(match[5]),
            parseInt(match[6])
          );
        } else {
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
 * 执行 WHOIS 查询
 */
async function whoisLookup(domain: string, server: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let data = '';
    
    socket.setTimeout(10000);
    
    socket.on('connect', () => {
      socket.write(`${domain}\r\n`);
    });
    
    socket.on('data', (chunk) => {
      data += chunk.toString();
    });
    
    socket.on('close', () => {
      resolve(data);
    });
    
    socket.on('error', (err) => {
      reject(err);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('WHOIS query timeout'));
    });
    
    socket.connect(43, server);
  });
}

/**
 * 从 WHOIS 结果中提取到期日期
 */
function extractExpiryDate(whoisText: string): Date | null {
  const patterns = [
    /Registry Expiry Date:\s*(.+)/i,
    /Expiry Date:\s*(.+)/i,
    /Registrar Registration Expiration Date:\s*(.+)/i,
    /Expiration Date:\s*(.+)/i,
    /expires:\s*(.+)/i,
    /Expiration Time:\s*(.+)/i,
    /paid-till:\s*(.+)/i,
    /Renewal Date:\s*(.+)/i,
    /Domain Expiration Date:\s*(.+)/i,
    /Expire Date:\s*(.+)/i,
    /Valid Until:\s*(.+)/i,
    /Valid-Until:\s*(.+)/i,
    /expire:\s*(.+)/i,
    /Expiry:\s*(.+)/i,
    /Expiration:\s*(.+)/i,
    /Domain Status:\s*.*Expir/i,
  ];
  
  for (const pattern of patterns) {
    const match = whoisText.match(pattern);
    if (match) {
      const date = parseDate(match[1].trim());
      if (date) return date;
    }
  }
  
  return null;
}

/**
 * 从 WHOIS 结果中提取注册商
 */
function extractRegistrar(whoisText: string): string | null {
  const patterns = [
    /Registrar:\s*(.+)/i,
    /Sponsoring Registrar:\s*(.+)/i,
    /Registrar Name:\s*(.+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = whoisText.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  return null;
}

/**
 * 从 WHOIS 结果中提取域名服务器
 */
function extractNameServers(whoisText: string): string[] {
  const ns: string[] = [];
  const patterns = [
    /Name Server:\s*(.+)/gi,
    /Nserver:\s*(.+)/gi,
    /NS:\s*(.+)/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(whoisText)) !== null) {
      ns.push(match[1].trim().toLowerCase());
    }
  }
  
  return [...new Set(ns)];
}

/**
 * 获取 WHOIS 服务器
 */
function getWhoisServer(domain: string): string | null {
  const parts = domain.toLowerCase().split('.');
  const tld = parts[parts.length - 1];
  
  // 首先尝试完整后缀匹配
  if (parts.length >= 2) {
    const secondLevel = parts.slice(-2).join('.');
    if (WHOIS_SERVERS[secondLevel]) {
      return WHOIS_SERVERS[secondLevel];
    }
  }
  
  // 然后尝试 TLD 匹配
  return WHOIS_SERVERS[tld] || null;
}

/**
 * Direct WHOIS Provider（主要查询方式）
 */
class DirectWhoisProvider implements WhoisProvider {
  name = 'direct-whois';
  
  async query(domain: string): Promise<WhoisResult | null> {
    const server = getWhoisServer(domain);
    if (!server) {
      log.warn('WhoisProvider', `No WHOIS server configured for ${domain}`, {
        domain,
        tld: domain.split('.').pop(),
        availableTlds: Object.keys(WHOIS_SERVERS).slice(0, 20),
      });
      return null;
    }
    
    try {
      log.info('WhoisProvider', `Querying ${domain} via ${server}`);
      const raw = await whoisLookup(domain, server);
      
      if (!raw || raw.includes('No match') || raw.includes('NOT FOUND') || raw.includes('Not found')) {
        log.warn('WhoisProvider', `Domain ${domain} not found in WHOIS`, {
          domain,
          server,
          responseLength: raw?.length || 0,
          responsePreview: raw?.substring(0, 200) || 'empty',
        });
        return null;
      }
      
      // 检查是否包含限制信息
      if (raw.includes('rate limit') || raw.includes('Rate limit') || raw.includes('quota exceeded')) {
        log.warn('WhoisProvider', `Rate limit hit for ${domain}`, {
          domain,
          server,
        });
      }
      
      const expiryDate = extractExpiryDate(raw);
      const registrar = extractRegistrar(raw);
      const nameServers = extractNameServers(raw);
      
      // 记录提取结果（无论成功与否）
      if (expiryDate) {
        log.info('WhoisProvider', `Successfully extracted expiry for ${domain}`, {
          domain,
          expiryDate: expiryDate.toISOString(),
          registrar,
          nameServerCount: nameServers.length,
        });
      } else {
        // 提取失败时记录更多信息以便诊断
        log.warn('WhoisProvider', `Failed to extract expiry date for ${domain}`, {
          domain,
          server,
          registrar,
          nameServerCount: nameServers.length,
          responseLength: raw.length,
          // 查找可能包含日期相关信息的行
          dateRelatedLines: raw.split('\n')
            .filter(line => 
              /expir|expiry|expiration|valid|paid|renewal/i.test(line) && 
              /\d{4}/.test(line)
            )
            .slice(0, 10),
          responsePreview: raw.substring(0, 1000),
        });
      }
      
      return {
        domain,
        expiryDate,
        registrar,
        nameServers,
        raw,
      };
    } catch (error) {
      log.error('WhoisProvider', `Direct WHOIS error for ${domain}`, {
        domain,
        server,
        error: error instanceof Error ? error.message : String(error),
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
      'com': 'https://rdap.verisign-grs.com/com/v1/',
      'net': 'https://rdap.verisign-grs.com/net/v1/',
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
      'top': 'https://rdap.nic.top/',
      'xyz': 'https://rdap.nic.xyz/',
      'club': 'https://rdap.nic.club/',
      'online': 'https://rdap.nic.online/',
      'site': 'https://rdap.nic.site/',
      'store': 'https://rdap.nic.store/',
      'vip': 'https://rdap.nic.vip/',
      'work': 'https://rdap.nic.work/',
      'icu': 'https://rdap.nic.icu/',
      'cyou': 'https://rdap.nic.cyou/',
      'today': 'https://rdap.nic.today/',
      'tokyo': 'https://rdap.nic.tokyo/',
      'tools': 'https://rdap.nic.tools/',
      'town': 'https://rdap.nic.town/',
      'toys': 'https://rdap.nic.toys/',
      'trade': 'https://rdap.nic.trade/',
      'training': 'https://rdap.nic.training/',
      'tube': 'https://rdap.nic.tube/',
    };
    
    return rdapServers[tld] || null;
  }
  
  async query(domain: string): Promise<WhoisResult | null> {
    const baseUrl = this.getRdapUrl(domain);
    if (!baseUrl) {
      log.info('WhoisProvider', `RDAP: No server for TLD of ${domain}`, { domain, tld: domain.split('.').pop() });
      return null;
    }
    
    try {
      const url = `${baseUrl}domain/${domain}`;
      log.info('WhoisProvider', `RDAP querying ${domain}`, { url });
      
      const response = await fetch(url, {
        headers: { 'Accept': 'application/rdap+json' },
      });
      
      if (!response.ok) {
        log.warn('WhoisProvider', `RDAP: HTTP ${response.status} for ${domain}`, {
          domain,
          status: response.status,
          statusText: response.statusText,
        });
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
      
      if (expiryDate) {
        log.info('WhoisProvider', `RDAP successfully got expiry for ${domain}`, {
          domain,
          expiryDate: expiryDate.toISOString(),
          registrar,
        });
      } else {
        log.warn('WhoisProvider', `RDAP: No expiry date found for ${domain}`, {
          domain,
          hasEvents: !!data.events,
          events: data.events?.map((e: any) => ({ action: e.eventAction, date: e.eventDate })),
        });
      }
      
      return {
        domain,
        expiryDate,
        registrar,
        nameServers: data.nameservers?.map((n: any) => n.ldhName) || [],
        raw: JSON.stringify(data),
      };
    } catch (error) {
      log.error('WhoisProvider', `RDAP error for ${domain}`, {
        domain,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

// 创建 Provider 实例
const providers: WhoisProvider[] = [
  new DirectWhoisProvider(),
  new RdapProvider(),
];

/**
 * 查询域名 WHOIS 信息
 * 依次尝试所有 Provider，直到获取到结果
 */
export async function queryWhois(domain: string): Promise<WhoisResult | null> {
  const rootDomain = getRootDomain(domain);
  
  if (rootDomain !== domain) {
    log.info('WhoisProvider', `Querying root domain ${rootDomain} for ${domain}`);
  }
  
  log.info('WhoisProvider', `Starting WHOIS query for ${domain} (root: ${rootDomain})`);
  
  let lastError: string | null = null;
  
  for (const provider of providers) {
    try {
      log.info('WhoisProvider', `Trying provider ${provider.name} for ${rootDomain}`);
      const result = await provider.query(rootDomain);
      if (result) {
        log.info('WhoisProvider', `Provider ${provider.name} returned result for ${rootDomain}`, {
          hasExpiryDate: !!result.expiryDate,
          expiryDate: result.expiryDate?.toISOString(),
          registrar: result.registrar,
          nameServerCount: result.nameServers.length,
        });
        if (result.expiryDate) {
          log.info('WhoisProvider', `Got expiry for ${domain} via ${provider.name}: ${result.expiryDate.toISOString()}`);
          return result;
        } else {
          lastError = `Provider ${provider.name} returned result but no expiry date`;
        }
      } else {
        lastError = `Provider ${provider.name} returned null`;
        log.info('WhoisProvider', `Provider ${provider.name} returned null for ${rootDomain}`);
      }
    } catch (error) {
      lastError = `Provider ${provider.name} failed: ${error instanceof Error ? error.message : String(error)}`;
      log.error('WhoisProvider', `Provider ${provider.name} failed for ${domain}`, { 
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  log.warn('WhoisProvider', `All providers failed for ${domain} (root: ${rootDomain})`, {
    domain,
    rootDomain,
    lastError,
    tld: rootDomain.split('.').pop(),
  });
  return null;
}
