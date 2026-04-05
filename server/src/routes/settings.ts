import { Router, Request, Response } from 'express';
import { authMiddleware, adminOnly } from '../middleware/auth';
import bcrypt from 'bcryptjs';
import { getLoginLimitConfig, updateLoginLimitConfig, getLoginAttemptStats, unlockAccount } from '../service/loginLimit';
import { getAdapter } from '../db/adapter';
import { getSmtpConfig, updateSmtpConfig, sendSmtpEmail } from '../service/smtp';
import { logAuditOperation } from '../service/audit';

const router = Router();
type SecurityConfig = { jwtViewEmailNotify: boolean };
const DEFAULT_SECURITY_CONFIG: SecurityConfig = { jwtViewEmailNotify: true };
type OAuthConfig = {
  enabled: boolean;
  template: 'generic' | 'logto';
  providerName: string;
  subjectKey: string;
  emailKey: string;
  logtoDomain: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  jwksUri: string;
  scopes: string;
  redirectUri: string;
};
const DEFAULT_OAUTH_CONFIG: OAuthConfig = {
  enabled: false,
  template: 'generic',
  providerName: 'default',
  subjectKey: 'sub',
  emailKey: 'email',
  logtoDomain: '',
  clientId: '',
  clientSecret: '',
  issuer: '',
  authorizationEndpoint: '',
  tokenEndpoint: '',
  userInfoEndpoint: '',
  jwksUri: '',
  scopes: 'openid profile email',
  redirectUri: '',
};
const DEFAULT_LOGTO_OAUTH_CONFIG: OAuthConfig = {
  ...DEFAULT_OAUTH_CONFIG,
  template: 'logto',
  providerName: 'Logto',
};

function normalizeLogtoDomain(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Invalid Logto domain URL');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Logto domain must use https');
  }
  return `${url.protocol}//${url.host}`;
}

function applyOAuthTemplate(input: OAuthConfig): OAuthConfig {
  if (input.template !== 'logto') return input;
  const domain = normalizeLogtoDomain(input.logtoDomain);
  if (!domain) throw new Error('logtoDomain is required for Logto template');
  return {
    ...input,
    logtoDomain: domain,
    providerName: input.providerName || 'Logto',
    issuer: `${domain}/oidc`,
    jwksUri: `${domain}/oidc/jwks`,
    authorizationEndpoint: `${domain}/oidc/auth`,
    tokenEndpoint: `${domain}/oidc/token`,
    userInfoEndpoint: `${domain}/oidc/me`,
  };
}

async function getSecurityConfig(): Promise<SecurityConfig> {
  const db = getAdapter();
  if (!db) return DEFAULT_SECURITY_CONFIG;
  const row = await db.get('SELECT value FROM system_settings WHERE key = ?', ['security_config']) as { value: string } | undefined;
  if (!row?.value) return DEFAULT_SECURITY_CONFIG;
  try {
    const parsed = JSON.parse(row.value) as Partial<SecurityConfig>;
    return { ...DEFAULT_SECURITY_CONFIG, ...parsed };
  } catch {
    return DEFAULT_SECURITY_CONFIG;
  }
}

async function updateSecurityConfig(input: Partial<SecurityConfig>): Promise<SecurityConfig> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');
  const next = { ...(await getSecurityConfig()), ...input };
  const payload = ['security_config', JSON.stringify(next)];
  if (db.type === 'mysql') {
    await db.execute(
      'INSERT INTO system_settings (`key`, `value`, updated_at) VALUES (?, ?, ' + db.now() + ') ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = ' + db.now(),
      payload
    );
  } else {
    await db.execute(
      'INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ' + db.now() + ') ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ' + db.now(),
      payload
    );
  }
  return next;
}

async function getOAuthConfig(): Promise<OAuthConfig> {
  const db = getAdapter();
  if (!db) return DEFAULT_OAUTH_CONFIG;
  const row = await db.get('SELECT value FROM system_settings WHERE key = ?', ['oauth_config']) as { value: string } | undefined;
  if (!row?.value) return DEFAULT_OAUTH_CONFIG;
  try {
    const parsed = JSON.parse(row.value) as Partial<OAuthConfig>;
    return { ...DEFAULT_OAUTH_CONFIG, ...parsed };
  } catch {
    return DEFAULT_OAUTH_CONFIG;
  }
}

async function getLogtoOAuthConfig(): Promise<OAuthConfig> {
  const db = getAdapter();
  if (!db) return DEFAULT_LOGTO_OAUTH_CONFIG;
  const row = await db.get('SELECT value FROM system_settings WHERE key = ?', ['oauth_logto_config']) as { value: string } | undefined;
  if (!row?.value) return DEFAULT_LOGTO_OAUTH_CONFIG;
  try {
    const parsed = JSON.parse(row.value) as Partial<OAuthConfig>;
    return { ...DEFAULT_LOGTO_OAUTH_CONFIG, ...parsed, template: 'logto' };
  } catch {
    return DEFAULT_LOGTO_OAUTH_CONFIG;
  }
}

async function updateOAuthConfig(input: Partial<OAuthConfig>): Promise<OAuthConfig> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');
  const next = applyOAuthTemplate({ ...(await getOAuthConfig()), ...input });
  if (next.enabled) {
    const required = ['clientId', 'clientSecret', 'authorizationEndpoint', 'tokenEndpoint', 'userInfoEndpoint', 'jwksUri'] as const;
    for (const k of required) {
      if (!String(next[k] || '').trim()) throw new Error(`${k} is required`);
    }
    if (!String(next.subjectKey || '').trim()) throw new Error('subjectKey is required');
  }
  const payload = ['oauth_config', JSON.stringify(next)];
  if (db.type === 'mysql') {
    await db.execute(
      'INSERT INTO system_settings (`key`, `value`, updated_at) VALUES (?, ?, ' + db.now() + ') ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = ' + db.now(),
      payload
    );
  } else {
    await db.execute(
      'INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ' + db.now() + ') ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ' + db.now(),
      payload
    );
  }
  return next;
}

async function updateLogtoOAuthConfig(input: Partial<OAuthConfig>): Promise<OAuthConfig> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');
  const next = applyOAuthTemplate({ ...(await getLogtoOAuthConfig()), ...input, template: 'logto' });
  if (next.enabled) {
    const required = ['clientId', 'clientSecret', 'authorizationEndpoint', 'tokenEndpoint', 'userInfoEndpoint', 'jwksUri'] as const;
    for (const k of required) {
      if (!String(next[k] || '').trim()) throw new Error(`${k} is required`);
    }
  }
  const payload = ['oauth_logto_config', JSON.stringify(next)];
  if (db.type === 'mysql') {
    await db.execute(
      'INSERT INTO system_settings (`key`, `value`, updated_at) VALUES (?, ?, ' + db.now() + ') ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = ' + db.now(),
      payload
    );
  } else {
    await db.execute(
      'INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ' + db.now() + ') ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ' + db.now(),
      payload
    );
  }
  return next;
}

/**
 * @swagger
 * /api/settings/jwt-secret:
 *   post:
 *     summary: Verify initial super admin password and get JWT base secret (admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: JWT base secret
 */
router.post('/jwt-secret', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (!password) {
    res.status(400).json({ code: 400, msg: 'Password is required' });
    return;
  }

  const db = getAdapter();
  if (!db) {
    res.status(500).json({ code: 500, msg: 'Database not available' });
    return;
  }

  const currentUser = await db.get('SELECT id, password_hash FROM users WHERE id = ?', [req.user!.userId]) as { id: number; password_hash: string } | undefined;
  if (!currentUser || !bcrypt.compareSync(password, currentUser.password_hash)) {
    res.status(401).json({ code: 401, msg: 'Invalid admin password' });
    return;
  }

  const initialSuper = await db.get('SELECT id FROM users WHERE role_level = 3 ORDER BY id ASC LIMIT 1') as { id: number } | undefined;
  if (!initialSuper || initialSuper.id !== req.user!.userId) {
    res.status(403).json({ code: 403, msg: 'Only the initial super admin can view JWT secret' });
    return;
  }

  const jwtSecret = process.env.JWT_SECRET || '';
  await logAuditOperation(req.user!.userId, 'view_jwt_secret', 'system', { success: true });
  try {
    const secCfg = await getSecurityConfig();
    if (secCfg.jwtViewEmailNotify) {
      const superInfo = await db.get('SELECT email, username FROM users WHERE id = ?', [initialSuper.id]) as { email: string; username: string } | undefined;
      if (superInfo?.email) {
        await sendSmtpEmail(
          superInfo.email,
          'DNSMgr Security Notice: JWT Secret Viewed',
          `Hello ${superInfo.username || 'admin'},\n\nYour JWT secret was viewed at ${new Date().toISOString()} by user ID ${req.user!.userId}.`
        );
      }
    }
  } catch (e) {
    console.warn('[Security] Failed to send JWT view notification email:', e);
  }
  res.json({
    code: 0,
    data: { jwtSecret },
    msg: 'success',
  });
});

router.get('/notifications', authMiddleware, adminOnly, async (_req: Request, res: Response) => {
  const db = getAdapter();
  if (!db) return res.status(500).json({ code: 500, msg: 'Database error' });
  const row = await db.get('SELECT value FROM system_settings WHERE key = ?', ['notification_channels']) as any;
  if (!row?.value) {
    res.json({ code: 0, data: [], msg: 'success' });
    return;
  }
  try {
    const channels = JSON.parse(row.value);
    res.json({ code: 0, data: channels, msg: 'success' });
  } catch {
    res.json({ code: 0, data: [], msg: 'success' });
  }
});

router.put('/notifications', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const db = getAdapter();
  if (!db) return res.status(500).json({ code: 500, msg: 'Database error' });
  const channels = req.body.channels;
  if (!Array.isArray(channels)) return res.status(400).json({ code: -1, msg: 'Invalid channels array' });
  
  const payload = ['notification_channels', JSON.stringify(channels)];
  if (db.type === 'mysql') {
    await db.execute(
      'INSERT INTO system_settings (`key`, `value`, updated_at) VALUES (?, ?, ' + db.now() + ') ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = ' + db.now(),
      payload
    );
  } else {
    await db.execute(
      'INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ' + db.now() + ') ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ' + db.now(),
      payload
    );
  }
  res.json({ code: 0, msg: 'success' });
});

router.get('/security', authMiddleware, adminOnly, async (_req: Request, res: Response) => {
  const db = getAdapter();
  if (!db) return res.status(500).json({ code: 500, msg: 'Database error' });
  const row = await db.get('SELECT value FROM system_settings WHERE key = ?', ['security_config']) as any;
  
  const expiryNotifyRow = await db.get('SELECT value FROM system_settings WHERE key = ?', ['domain_expiry_notification']) as any;
  const expiryDaysRow = await db.get('SELECT value FROM system_settings WHERE key = ?', ['domain_expiry_days']) as any;

  const defaultConf = { 
    jwtViewEmailNotify: false,
    domainExpiryNotify: expiryNotifyRow ? (expiryNotifyRow.value === '1' || expiryNotifyRow.value === 'true') : false,
    domainExpiryDays: expiryDaysRow ? parseInt(expiryDaysRow.value) : 30
  };
  
  if (!row?.value) {
    res.json({ code: 0, data: defaultConf, msg: 'success' });
    return;
  }
  
  try {
    const config = JSON.parse(row.value);
    res.json({ code: 0, data: { ...defaultConf, ...config }, msg: 'success' });
  } catch {
    res.json({ code: 0, data: defaultConf, msg: 'success' });
  }
});

router.put('/security', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const db = getAdapter();
  if (!db) return res.status(500).json({ code: 500, msg: 'Database error' });
  const { jwtViewEmailNotify, domainExpiryNotify, domainExpiryDays } = req.body;
  const config = { jwtViewEmailNotify: !!jwtViewEmailNotify };
  
  const payload = ['security_config', JSON.stringify(config)];
  if (db.type === 'mysql') {
    await db.execute(
      'INSERT INTO system_settings (`key`, `value`, updated_at) VALUES (?, ?, ' + db.now() + ') ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = ' + db.now(),
      payload
    );
    if (domainExpiryNotify !== undefined) {
      await db.execute(
        'INSERT INTO system_settings (`key`, `value`, updated_at) VALUES (?, ?, ' + db.now() + ') ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = ' + db.now(),
        ['domain_expiry_notification', domainExpiryNotify ? '1' : '0']
      );
    }
    if (domainExpiryDays !== undefined) {
      await db.execute(
        'INSERT INTO system_settings (`key`, `value`, updated_at) VALUES (?, ?, ' + db.now() + ') ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = ' + db.now(),
        ['domain_expiry_days', String(domainExpiryDays)]
      );
    }
  } else {
    await db.execute(
      'INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ' + db.now() + ') ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ' + db.now(),
      payload
    );
    if (domainExpiryNotify !== undefined) {
      await db.execute(
        'INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ' + db.now() + ') ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ' + db.now(),
        ['domain_expiry_notification', domainExpiryNotify ? '1' : '0']
      );
    }
    if (domainExpiryDays !== undefined) {
      await db.execute(
        'INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ' + db.now() + ') ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ' + db.now(),
        ['domain_expiry_days', String(domainExpiryDays)]
      );
    }
  }
  
  res.json({ code: 0, msg: 'success' });
});

router.get('/smtp', authMiddleware, adminOnly, async (_req: Request, res: Response) => {
  try {
    const config = await getSmtpConfig();
    res.json({ code: 0, data: config, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get SMTP config' });
  }
});

router.put('/smtp', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const next = await updateSmtpConfig(req.body || {});
    await logAuditOperation(req.user!.userId, 'update_smtp_config', 'system', { enabled: next.enabled, host: next.host, port: next.port });
    res.json({ code: 0, data: next, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to update SMTP config' });
  }
});

router.post('/smtp/test', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const { to } = req.body as { to?: string };
  try {
    const db = getAdapter();
    if (!db) {
      res.status(500).json({ code: 500, msg: 'Database not available' });
      return;
    }
    const me = await db.get('SELECT email FROM users WHERE id = ?', [req.user!.userId]) as { email: string } | undefined;
    const target = (to || me?.email || '').trim();
    if (!target) {
      res.status(400).json({ code: 400, msg: 'Target email is required' });
      return;
    }
    await sendSmtpEmail(target, 'DNSMgr SMTP Test', 'This is a test email from DNSMgr SMTP settings.');
    await logAuditOperation(req.user!.userId, 'smtp_test_email', 'system', { to: target });
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to send test email' });
  }
});

router.get('/oauth', authMiddleware, adminOnly, async (_req: Request, res: Response) => {
  try {
    const config = await getOAuthConfig();
    res.json({ code: 0, data: config, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get OAuth config' });
  }
});

router.put('/oauth', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const config = await updateOAuthConfig({ ...(req.body || {}), template: 'generic' });
    await logAuditOperation(req.user!.userId, 'update_oauth_config', 'system', { enabled: config.enabled, providerName: config.providerName, issuer: config.issuer });
    res.json({ code: 0, data: config, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to update OAuth config' });
  }
});

router.get('/oauth/logto', authMiddleware, adminOnly, async (_req: Request, res: Response) => {
  try {
    const config = await getLogtoOAuthConfig();
    res.json({ code: 0, data: config, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get Logto OAuth config' });
  }
});

router.put('/oauth/logto', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const config = await updateLogtoOAuthConfig(req.body || {});
    await logAuditOperation(req.user!.userId, 'update_logto_oauth_config', 'system', { enabled: config.enabled, providerName: config.providerName, logtoDomain: config.logtoDomain });
    res.json({ code: 0, data: config, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to update Logto OAuth config' });
  }
});

router.post('/oauth/oidc-discover', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const { issuer } = req.body as { issuer?: string };
  if (!issuer) {
    res.status(400).json({ code: 400, msg: 'issuer is required' });
    return;
  }
  try {
    const base = issuer.replace(/\/+$/, '');
    const url = `${base}/.well-known/openid-configuration`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OIDC discovery failed: HTTP ${response.status}`);
    }
    const data = await response.json() as Record<string, unknown>;
    const mapped: Partial<OAuthConfig> = {
      issuer: String(data.issuer || base),
      authorizationEndpoint: String(data.authorization_endpoint || ''),
      tokenEndpoint: String(data.token_endpoint || ''),
      userInfoEndpoint: String(data.userinfo_endpoint || ''),
      jwksUri: String(data.jwks_uri || ''),
      scopes: Array.isArray(data.scopes_supported) ? (data.scopes_supported as unknown[]).join(' ') : DEFAULT_OAUTH_CONFIG.scopes,
      subjectKey: DEFAULT_OAUTH_CONFIG.subjectKey,
      emailKey: DEFAULT_OAUTH_CONFIG.emailKey,
      template: 'generic',
    };
    res.json({ code: 0, data: mapped, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'OIDC discovery failed' });
  }
});

/**
 * @swagger
 * /api/settings/login-limit:
 *   get:
 *     summary: Get login limit configuration
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Login limit configuration
 */
router.get('/login-limit', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const config = await getLoginLimitConfig();
    res.json({
      code: 0,
      data: config,
      msg: 'success',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error instanceof Error ? error.message : 'Failed to get login limit config',
    });
  }
});

/**
 * @swagger
 * /api/settings/login-limit:
 *   put:
 *     summary: Update login limit configuration
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *               maxAttempts:
 *                 type: integer
 *               lockoutDuration:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Configuration updated
 */
router.put('/login-limit', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const { enabled, maxAttempts, lockoutDuration } = req.body;
  
  try {
    const updateData: Partial<{ enabled: boolean; maxAttempts: number; lockoutDuration: number }> = {};
    
    if (enabled !== undefined) updateData.enabled = enabled;
    if (maxAttempts !== undefined) updateData.maxAttempts = maxAttempts;
    if (lockoutDuration !== undefined) updateData.lockoutDuration = lockoutDuration;
    
    await updateLoginLimitConfig(updateData);
    
    const config = await getLoginLimitConfig();
    res.json({
      code: 0,
      data: config,
      msg: 'success',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error instanceof Error ? error.message : 'Failed to update login limit config',
    });
  }
});

/**
 * @swagger
 * /api/settings/login-attempts/stats:
 *   get:
 *     summary: Get login attempt statistics
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Login attempt statistics
 */
router.get('/login-attempts/stats', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const stats = await getLoginAttemptStats();
    res.json({
      code: 0,
      data: stats,
      msg: 'success',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error instanceof Error ? error.message : 'Failed to get login attempt stats',
    });
  }
});

/**
 * @swagger
 * /api/settings/login-attempts/unlock:
 *   post:
 *     summary: Manually unlock an account
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier]
 *             properties:
 *               identifier:
 *                 type: string
 *     responses:
 *       200:
 *         description: Account unlocked
 */
router.post('/login-attempts/unlock', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const { identifier } = req.body;
  
  if (!identifier) {
    res.json({ code: -1, msg: 'Identifier is required' });
    return;
  }
  
  try {
    await unlockAccount(identifier);
    res.json({
      code: 0,
      msg: 'Account unlocked successfully',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error instanceof Error ? error.message : 'Failed to unlock account',
    });
  }
});

export default router;
