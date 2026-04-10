import { query, get, execute, insert, run, now, getDbType } from '../db';
import { checkAuditRules } from './auditRules';
import { log } from '../lib/logger';

/**
 * 将日期格式化为数据库兼容的格式 (YYYY-MM-DD HH:mm:ss)
 */
function formatDateForDB(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Default configuration
const DEFAULT_CONFIG = {
  enabled: true,
  maxAttempts: 10,
  lockoutDuration: 60, // minutes
};

interface LoginLimitConfig {
  enabled: boolean;
  maxAttempts: number;
  lockoutDuration: number; // minutes
}

interface LoginAttempt {
  id: number;
  identifier: string;
  ip_address: string;
  attempt_count: number;
  last_attempt_at: string;
  locked_until: string | null;
}

// Get login limit configuration
export async function getLoginLimitConfig(): Promise<LoginLimitConfig> {
  try {
    const result = await get('SELECT value FROM system_settings WHERE key = ?', ['login_limit_config']);
    if (result) {
      return { ...DEFAULT_CONFIG, ...JSON.parse((result as { value: string }).value) };
    }
  } catch (e) {
    log.error('LoginLimit', 'Failed to get config', { error: e });
  }
  return DEFAULT_CONFIG;
}

// Update login limit configuration
export async function updateLoginLimitConfig(config: Partial<LoginLimitConfig>): Promise<void> {
  const currentConfig = await getLoginLimitConfig();
  const newConfig = { ...currentConfig, ...config };

  const payload = ['login_limit_config', JSON.stringify(newConfig)];
  const dbType = getDbType();
  if (dbType === 'mysql') {
    await execute(
      'INSERT INTO system_settings (`key`, `value`, updated_at) VALUES (?, ?, ' + now() + ') ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = ' + now(),
      payload
    );
    return;
  }

  await execute(
    'INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ' + now() + ') ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ' + now(),
    payload
  );
}

// Check if login is allowed for identifier (username or email)
export async function checkLoginAllowed(identifier: string, ipAddress: string = ''): Promise<{ allowed: boolean; message?: string; remainingAttempts?: number }> {
  const config = await getLoginLimitConfig();
  
  if (!config.enabled) {
    return { allowed: true };
  }

  try {
    // Check existing attempt record
    const result = await get(
      'SELECT * FROM login_attempts WHERE identifier = ? ORDER BY created_at DESC LIMIT 1',
      [identifier.toLowerCase()]
    );
    
    const attempt = result as LoginAttempt | undefined;

    if (attempt && attempt.locked_until) {
      const lockedUntil = new Date(attempt.locked_until);
      const nowTime = new Date();
      
      if (lockedUntil > nowTime) {
        const minutesLeft = Math.ceil((lockedUntil.getTime() - nowTime.getTime()) / (1000 * 60));
        return {
          allowed: false,
          message: `Account locked. Please try again in ${minutesLeft} minute(s).`,
        };
      }
    }

    // Calculate remaining attempts
    const currentAttempts = attempt?.attempt_count || 0;
    const remainingAttempts = Math.max(0, config.maxAttempts - currentAttempts);

    return {
      allowed: true,
      remainingAttempts,
    };
  } catch (e) {
    log.error('LoginLimit', 'Failed to check login allowed', { error: e });
    return { allowed: true };
  }
}

// Record failed login attempt
export async function recordFailedAttempt(identifier: string, ipAddress: string = ''): Promise<{ locked: boolean; message?: string }> {
  const config = await getLoginLimitConfig();
  
  if (!config.enabled) {
    return { locked: false };
  }

  try {
    const normalizedIdentifier = identifier.toLowerCase();
    
    // Get existing record
    const result = await get(
      'SELECT * FROM login_attempts WHERE identifier = ? ORDER BY created_at DESC LIMIT 1',
      [normalizedIdentifier]
    );
    
    const attempt = result as LoginAttempt | undefined;
    const nowTime = new Date();

    if (attempt) {
      // Check if already locked
      if (attempt.locked_until) {
        const lockedUntil = new Date(attempt.locked_until);
        if (lockedUntil > nowTime) {
          const minutesLeft = Math.ceil((lockedUntil.getTime() - nowTime.getTime()) / (1000 * 60));
          return {
            locked: true,
            message: `Account locked. Please try again in ${minutesLeft} minute(s).`,
          };
        }
      }

      // Increment attempt count
      const newCount = attempt.attempt_count + 1;
      
      // Check if should lock
      if (newCount >= config.maxAttempts) {
        const lockoutMinutes = config.lockoutDuration;
        const lockedUntil = new Date(nowTime.getTime() + lockoutMinutes * 60 * 1000);
        
        await execute(
          'UPDATE login_attempts SET attempt_count = ?, last_attempt_at = ' + now() + ', locked_until = ? WHERE id = ?',
          [newCount, formatDateForDB(lockedUntil), attempt.id]
        );
        
        checkAuditRules(0, 'login_failed', '', { identifier: normalizedIdentifier, ip: ipAddress, attemptCount: newCount }).catch(e => log.error('LoginLimit', 'Audit rule check failed', { error: e }));
        
        return {
          locked: true,
          message: `Too many failed attempts. Account locked for ${lockoutMinutes} minute(s).`,
        };
      }

      // Update attempt count
      await execute(
        'UPDATE login_attempts SET attempt_count = ?, last_attempt_at = ' + now() + ', locked_until = NULL WHERE id = ?',
        [newCount, attempt.id]
      );
      
      checkAuditRules(0, 'login_failed', '', { identifier: normalizedIdentifier, ip: ipAddress, attemptCount: newCount }).catch(e => log.error('LoginLimit', 'Audit rule check failed', { error: e }));

      const remainingAttempts = config.maxAttempts - newCount;
      return {
        locked: false,
        message: remainingAttempts > 0 ? `${remainingAttempts} attempt(s) remaining.` : undefined,
      };
    } else {
      // Create new record
      await execute(
        'INSERT INTO login_attempts (identifier, ip_address, attempt_count, last_attempt_at) VALUES (?, ?, 1, ' + now() + ')',
        [normalizedIdentifier, ipAddress]
      );

      const remainingAttempts = config.maxAttempts - 1;
      return {
        locked: false,
        message: `${remainingAttempts} attempt(s) remaining.`,
      };
    }
  } catch (e) {
    log.error('LoginLimit', 'Failed to record failed attempt', { error: e });
    return { locked: false };
  }
}

// Clear login attempts on successful login
export async function clearLoginAttempts(identifier: string): Promise<void> {
  try {
    await execute(
      'DELETE FROM login_attempts WHERE identifier = ?',
      [identifier.toLowerCase()]
    );
  } catch (e) {
    log.error('LoginLimit', 'Failed to clear attempts', { error: e });
  }
}

// Get login attempt statistics (for admin)
export async function getLoginAttemptStats(): Promise<{
  totalLocked: number;
  recentAttempts: number;
  topIdentifiers: { identifier: string; attempts: number }[];
}> {
  try {
    const dbType = getDbType();
    const nowExpr = dbType === 'sqlite' ? "datetime('now')" : dbType === 'mysql' ? 'NOW()' : 'NOW()';
    const yesterdayExpr = dbType === 'sqlite' ? "datetime('now', '-1 day')" : dbType === 'mysql' ? 'NOW() - INTERVAL 1 DAY' : 'NOW() - INTERVAL \'1 day\'';

    // Get total locked accounts
    const lockedResult = await get(
      `SELECT COUNT(*) as cnt FROM login_attempts WHERE locked_until > ${nowExpr}`
    );
    const totalLocked = (lockedResult as { cnt: number })?.cnt || 0;

    // Get recent attempts (last 24 hours)
    const recentResult = await get(
      `SELECT COUNT(*) as cnt FROM login_attempts WHERE last_attempt_at > ${yesterdayExpr}`
    );
    const recentAttempts = (recentResult as { cnt: number })?.cnt || 0;

    // Get top identifiers with failed attempts
    const topResult = await query(
      'SELECT identifier, attempt_count as attempts FROM login_attempts ORDER BY attempt_count DESC LIMIT 10'
    );
    const topIdentifiers = (topResult as { identifier: string; attempts: number }[]) || [];

    return {
      totalLocked,
      recentAttempts,
      topIdentifiers,
    };
  } catch (e) {
    log.error('LoginLimit', 'Failed to get stats', { error: e });
    return { totalLocked: 0, recentAttempts: 0, topIdentifiers: [] };
  }
}

// Manually unlock an account (for admin)
export async function unlockAccount(identifier: string): Promise<void> {
  await execute(
    'DELETE FROM login_attempts WHERE identifier = ?',
    [identifier.toLowerCase()]
  );
}
