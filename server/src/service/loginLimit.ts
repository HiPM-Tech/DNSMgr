import { getAdapter } from '../db/adapter';

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
  const db = getAdapter();
  if (!db) return DEFAULT_CONFIG;

  try {
    const result = await db.get('SELECT value FROM system_settings WHERE key = ?', ['login_limit_config']);
    if (result) {
      return { ...DEFAULT_CONFIG, ...JSON.parse((result as { value: string }).value) };
    }
  } catch (e) {
    console.error('[LoginLimit] Failed to get config:', e);
  }
  return DEFAULT_CONFIG;
}

// Update login limit configuration
export async function updateLoginLimitConfig(config: Partial<LoginLimitConfig>): Promise<void> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');

  const currentConfig = await getLoginLimitConfig();
  const newConfig = { ...currentConfig, ...config };

  const payload = ['login_limit_config', JSON.stringify(newConfig)];
  if (db.type === 'mysql') {
    await db.execute(
      'INSERT INTO system_settings (`key`, `value`, updated_at) VALUES (?, ?, ' + db.now() + ') ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = ' + db.now(),
      payload
    );
    return;
  }

  await db.execute(
    'INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ' + db.now() + ') ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ' + db.now(),
    payload
  );
}

// Check if login is allowed for identifier (username or email)
export async function checkLoginAllowed(identifier: string, ipAddress: string = ''): Promise<{ allowed: boolean; message?: string; remainingAttempts?: number }> {
  const config = await getLoginLimitConfig();
  
  if (!config.enabled) {
    return { allowed: true };
  }

  const db = getAdapter();
  if (!db) return { allowed: true };

  try {
    // Check existing attempt record
    const result = await db.get(
      'SELECT * FROM login_attempts WHERE identifier = ? ORDER BY created_at DESC LIMIT 1',
      [identifier.toLowerCase()]
    );
    
    const attempt = result as LoginAttempt | undefined;

    if (attempt && attempt.locked_until) {
      const lockedUntil = new Date(attempt.locked_until);
      const now = new Date();
      
      if (lockedUntil > now) {
        const minutesLeft = Math.ceil((lockedUntil.getTime() - now.getTime()) / (1000 * 60));
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
    console.error('[LoginLimit] Failed to check login allowed:', e);
    return { allowed: true };
  }
}

// Record failed login attempt
export async function recordFailedAttempt(identifier: string, ipAddress: string = ''): Promise<{ locked: boolean; message?: string }> {
  const config = await getLoginLimitConfig();
  
  if (!config.enabled) {
    return { locked: false };
  }

  const db = getAdapter();
  if (!db) return { locked: false };

  try {
    const normalizedIdentifier = identifier.toLowerCase();
    
    // Get existing record
    const result = await db.get(
      'SELECT * FROM login_attempts WHERE identifier = ? ORDER BY created_at DESC LIMIT 1',
      [normalizedIdentifier]
    );
    
    const attempt = result as LoginAttempt | undefined;
    const now = new Date();

    if (attempt) {
      // Check if already locked
      if (attempt.locked_until) {
        const lockedUntil = new Date(attempt.locked_until);
        if (lockedUntil > now) {
          const minutesLeft = Math.ceil((lockedUntil.getTime() - now.getTime()) / (1000 * 60));
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
        const lockedUntil = new Date(now.getTime() + lockoutMinutes * 60 * 1000);
        
        await db.execute(
          'UPDATE login_attempts SET attempt_count = ?, last_attempt_at = ' + db.now() + ', locked_until = ? WHERE id = ?',
          [newCount, lockedUntil.toISOString(), attempt.id]
        );
        
        return {
          locked: true,
          message: `Too many failed attempts. Account locked for ${lockoutMinutes} minute(s).`,
        };
      }

      // Update attempt count
      await db.execute(
        'UPDATE login_attempts SET attempt_count = ?, last_attempt_at = ' + db.now() + ', locked_until = NULL WHERE id = ?',
        [newCount, attempt.id]
      );

      const remainingAttempts = config.maxAttempts - newCount;
      return {
        locked: false,
        message: remainingAttempts > 0 ? `${remainingAttempts} attempt(s) remaining.` : undefined,
      };
    } else {
      // Create new record
      await db.execute(
        'INSERT INTO login_attempts (identifier, ip_address, attempt_count, last_attempt_at) VALUES (?, ?, 1, ' + db.now() + ')',
        [normalizedIdentifier, ipAddress]
      );

      const remainingAttempts = config.maxAttempts - 1;
      return {
        locked: false,
        message: `${remainingAttempts} attempt(s) remaining.`,
      };
    }
  } catch (e) {
    console.error('[LoginLimit] Failed to record failed attempt:', e);
    return { locked: false };
  }
}

// Clear login attempts on successful login
export async function clearLoginAttempts(identifier: string): Promise<void> {
  const db = getAdapter();
  if (!db) return;

  try {
    await db.execute(
      'DELETE FROM login_attempts WHERE identifier = ?',
      [identifier.toLowerCase()]
    );
  } catch (e) {
    console.error('[LoginLimit] Failed to clear attempts:', e);
  }
}

// Get login attempt statistics (for admin)
export async function getLoginAttemptStats(): Promise<{
  totalLocked: number;
  recentAttempts: number;
  topIdentifiers: { identifier: string; attempts: number }[];
}> {
  const db = getAdapter();
  if (!db) {
    return { totalLocked: 0, recentAttempts: 0, topIdentifiers: [] };
  }

  try {
    // Get total locked accounts
    const lockedResult = await db.get(
      "SELECT COUNT(*) as cnt FROM login_attempts WHERE locked_until > datetime('now')"
    );
    const totalLocked = (lockedResult as { cnt: number })?.cnt || 0;

    // Get recent attempts (last 24 hours)
    const recentResult = await db.get(
      "SELECT COUNT(*) as cnt FROM login_attempts WHERE last_attempt_at > datetime('now', '-1 day')"
    );
    const recentAttempts = (recentResult as { cnt: number })?.cnt || 0;

    // Get top identifiers with failed attempts
    const topResult = await db.query(
      'SELECT identifier, attempt_count as attempts FROM login_attempts ORDER BY attempt_count DESC LIMIT 10'
    );
    const topIdentifiers = (topResult as { identifier: string; attempts: number }[]) || [];

    return {
      totalLocked,
      recentAttempts,
      topIdentifiers,
    };
  } catch (e) {
    console.error('[LoginLimit] Failed to get stats:', e);
    return { totalLocked: 0, recentAttempts: 0, topIdentifiers: [] };
  }
}

// Manually unlock an account (for admin)
export async function unlockAccount(identifier: string): Promise<void> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');

  await db.execute(
    'DELETE FROM login_attempts WHERE identifier = ?',
    [identifier.toLowerCase()]
  );
}
