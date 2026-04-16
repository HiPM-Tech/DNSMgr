import { AuditRulesOperations } from '../db/business-adapter';
import { sendNotification } from './notification';
import { getDbType } from '../db/business-adapter';

interface AuditRuleConfig {
  enabled: boolean;
  maxDeletionsPerHour: number;
  maxFailedLogins: number;
  offHoursStart: string; // HH:mm
  offHoursEnd: string; // HH:mm
}

export async function getAuditRuleConfig(): Promise<AuditRuleConfig> {
  const row = await AuditRulesOperations.getConfig() as any;
  if (!row?.value) return getDefaultConfig();
  try {
    return { ...getDefaultConfig(), ...JSON.parse(row.value) };
  } catch {
    return getDefaultConfig();
  }
}

function getDefaultConfig(): AuditRuleConfig {
  return {
    enabled: true,
    maxDeletionsPerHour: 10,
    maxFailedLogins: 5,
    offHoursStart: '22:00',
    offHoursEnd: '06:00'
  };
}

export async function checkAuditRules(userId: number, action: string, domain: string, data: any) {
  const config = await getAuditRuleConfig();
  if (!config.enabled) return;

  const user = await AuditRulesOperations.getUsername(userId) as any;
  const username = user?.username || `User#${userId}`;

  const timeStr = new Date().toLocaleString();

  // 1. Off-hours operation check
  if (action !== 'login' && action !== 'failover_switch') {
    const currentHour = new Date().getHours();
    const currentMin = new Date().getMinutes();
    const currentVal = currentHour + currentMin / 60;

    const [startH, startM] = config.offHoursStart.split(':').map(Number);
    const startVal = startH + startM / 60;

    const [endH, endM] = config.offHoursEnd.split(':').map(Number);
    const endVal = endH + endM / 60;

    let isOffHours = false;
    if (startVal < endVal) {
      isOffHours = currentVal >= startVal && currentVal <= endVal;
    } else {
      isOffHours = currentVal >= startVal || currentVal <= endVal;
    }

    if (isOffHours) {
      await sendNotification(
        `[Security Alert] Off-Hours Operation Detected`,
        `User **${username}** performed action \`${action}\` during configured off-hours.\nDomain: ${domain}\nTime: ${timeStr}`
      );
    }
  }

  // 2. High-frequency deletion check
  if (action === 'delete_record' || action === 'delete_domain') {
    const dbType = getDbType();
    let recentDeletions: any;
    if (dbType === 'sqlite') {
      recentDeletions = await AuditRulesOperations.getRecentDeletionsSQLite(userId);
    } else if (dbType === 'mysql') {
      recentDeletions = await AuditRulesOperations.getRecentDeletionsMySQL(userId);
    } else {
      recentDeletions = await AuditRulesOperations.getRecentDeletionsPostgreSQL(userId);
    }

    if (recentDeletions && recentDeletions.count >= config.maxDeletionsPerHour) {
      await sendNotification(
        `[Security Alert] High Frequency Deletion`,
        `User **${username}** has performed ${recentDeletions.count} deletion operations in the last hour.\nTime: ${timeStr}`
      );
    }
  }

  // 3. Failed login threshold check
  if (action === 'login_failed') {
    const identifier = data?.identifier || username;
    const attemptCount = data?.attemptCount || 1;

    if (attemptCount >= config.maxFailedLogins) {
      await sendNotification(
        `[Security Alert] Multiple Failed Logins`,
        `There have been ${attemptCount} failed login attempts for **${identifier}** recently.\nTime: ${timeStr}\nIP: ${data?.ip || 'Unknown'}`
      );
    }
  }

  // 4. Unusual IP logic can be added here if we track known IPs per user
}
