import { whoisDomain, firstResult } from 'whoiser';
import { query, get, execute, insert, run, now } from '../db';
import { Domain } from '../types';
import { sendNotification } from './notification';

export async function checkWhoisForDomain(domainName: string): Promise<Date | null> {
  try {
    const domainWhois = await whoisDomain(domainName, { follow: 1 });
    const firstFoundWhois = firstResult(domainWhois) as any;
    if (!firstFoundWhois) return null;
    
    // Some registrars use 'Registry Expiry Date' or 'Expiry Date'
    const expiryStr = firstFoundWhois['Registry Expiry Date'] || firstFoundWhois['Expiry Date'] || firstFoundWhois['Registrar Registration Expiration Date'];
    if (expiryStr) {
      const d = new Date(expiryStr);
      if (!isNaN(d.getTime())) return d;
    }
  } catch (error) {
    console.error(`Whois error for ${domainName}:`, error);
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
          console.error(`Failed to send expiration notification for ${d.name}:`, err);
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
    syncAllDomainsWhois().catch(console.error);
  }, 10 * 1000);

  // Run once every 24 hours
  setInterval(() => {
    syncAllDomainsWhois().catch(console.error);
  }, 24 * 60 * 60 * 1000);
}
