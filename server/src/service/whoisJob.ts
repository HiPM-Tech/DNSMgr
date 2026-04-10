import { whoisDomain, firstResult } from 'whoiser';
import { query, get, execute, insert, run, now } from '../db';
import { Domain } from '../types';
import { sendNotification } from './notification';
import { log } from '../lib/logger';

/**
 * 获取域名的根域名（注册域名）
 * 例如：blog.example.com -> example.com
 * 例如：www.test.co.uk -> test.co.uk
 */
function getRootDomain(domainName: string): string {
  const parts = domainName.toLowerCase().split('.');
  // 如果只有两部分或更少，直接返回
  if (parts.length <= 2) return domainName;

  // 处理常见的二级后缀
  const specialSuffixes = ['com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'co.uk', 'org.uk', 'net.uk'];
  const lastTwo = parts.slice(-2).join('.');
  const lastThree = parts.slice(-3).join('.');

  // 如果最后三部分匹配特殊后缀（如 test.co.uk），返回最后三部分
  if (specialSuffixes.includes(lastTwo)) {
    // 如果域名恰好是后缀本身（如 co.uk），返回原域名
    if (parts.length === 2) return domainName;
    // 否则返回最后三部分（如 test.co.uk）
    return parts.slice(-3).join('.');
  }

  // 标准后缀，返回最后两部分
  return lastTwo;
}

export async function checkWhoisForDomain(domainName: string): Promise<Date | null> {
  try {
    // 对于子域名，查询根域名
    const rootDomain = getRootDomain(domainName);
    if (rootDomain !== domainName) {
      log.debug('Whois', `Querying root domain ${rootDomain} for ${domainName}`);
    }
    
    const domainWhois = await whoisDomain(rootDomain, { follow: 1 });
    const firstFoundWhois = firstResult(domainWhois) as any;
    if (!firstFoundWhois) {
      log.warn('Whois', `No whois result found for ${domainName} (root: ${rootDomain})`);
      return null;
    }
    
    // 尝试多种可能的到期时间字段名
    const possibleExpiryKeys = [
      'Registry Expiry Date',
      'Expiry Date',
      'Registrar Registration Expiration Date',
      'Expiration Date',
      'expires',
      'Expiration Time',
      'paid-till',
      'Renewal Date'
    ];
    
    for (const key of possibleExpiryKeys) {
      const expiryStr = firstFoundWhois[key];
      if (expiryStr) {
        const d = new Date(expiryStr);
        if (!isNaN(d.getTime())) {
          log.debug('Whois', `Found expiry for ${domainName} using key "${key}": ${d.toISOString()}`);
          return d;
        }
      }
    }
    
    log.warn('Whois', `No expiry date found for ${domainName}. Available keys: ${Object.keys(firstFoundWhois).join(', ')}`);
  } catch (error) {
    log.error('Whois', `Error for ${domainName}`, { error: error instanceof Error ? error.message : String(error) });
  }
  return null;
}

export async function syncAllDomainsWhois() {
  const domains = await query('SELECT id, name FROM domains') as unknown as Domain[];
  for (const d of domains) {
    const expiresAt = await checkWhoisForDomain(d.name);
    if (expiresAt) {
      await query('UPDATE domains SET expires_at = ? WHERE id = ?', [
        expiresAt.toISOString(),
        d.id
      ]);

      const nowTime = new Date();
      const daysLeft = Math.ceil((expiresAt.getTime() - nowTime.getTime()) / (1000 * 60 * 60 * 24));
      
      // Check if we should send a notification
      const enableNotifyRow = await get('SELECT value FROM system_settings WHERE key = ?', ['domain_expiry_notification']) as any;
      const enableNotify = enableNotifyRow ? enableNotifyRow.value === '1' || enableNotifyRow.value === 'true' : false;
      
      const thresholdRow = await get('SELECT value FROM system_settings WHERE key = ?', ['domain_expiry_days']) as any;
      const threshold = thresholdRow ? parseInt(thresholdRow.value) : 30;

      if (enableNotify && (daysLeft === threshold || daysLeft === 7 || daysLeft === 1)) {
        try {
          await sendNotification(
            `[DNSMgr] Domain Expiring Soon: ${d.name}`,
            `Your domain ${d.name} is expiring in ${daysLeft} days (on ${expiresAt.toLocaleDateString()}). Please renew it soon.`
          );
        } catch (err) {
          log.error('Whois', `Failed to send expiration notification for ${d.name}`, { error: err });
        }
      }
    }
    // sleep a bit to avoid rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }
}

export function startWhoisJob() {
  // Run once on startup
  setTimeout(() => {
    syncAllDomainsWhois().catch(err => log.error('Whois', 'Sync error', { error: err }));
  }, 10 * 1000);

  // Run once every 24 hours
  setInterval(() => {
    syncAllDomainsWhois().catch(err => log.error('Whois', 'Sync error', { error: err }));
  }, 24 * 60 * 60 * 1000);
}
