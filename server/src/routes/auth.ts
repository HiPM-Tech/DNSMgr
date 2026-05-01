import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { authMiddleware, signToken } from '../middleware/auth';
import { User } from '../types';
import { ROLE_SUPER, ROLE_USER } from '../utils/roles';
import { checkLoginAllowed, recordFailedAttempt, clearLoginAttempts } from '../service/loginLimit';
import { sendEmailVerificationCode, verifyEmailVerificationCode } from '../service/emailVerification';
import { logAuditOperation } from '../service/audit';
import { getSmtpConfig, sendSmtpEmail } from '../service/smtp';
import { getUserPreferences, updateUserPreferences, UserPreferences } from '../service/userPreferences';
import { loginLimiter, registerLimiter, emailLimiter } from '../middleware/rateLimit';
import { getTOTPStatus, verifyTOTPToken, verifyBackupCode } from '../service/totp';
import { isValidUsername } from '../utils/validation';
import { log } from '../lib/logger';
import { UserOperations, OAuthOperations, TwoFAOperations, SettingsOperations, UserPreferencesOperations } from '../db/business-adapter';
import { requires2FA, has2FAEnabled, validatePassword, getSecurityPolicy, SecurityPolicy } from '../service/securityPolicy';
import { verifyTrustedDevice, addTrustedDevice, DeviceInfo } from '../service/deviceTrust';
import { getRequestIP } from '../middleware/clientIP';


const router = Router();
const resetStore = new Map<string, { code: string; expiresAt: number }>();
// OAuth state 现在存储在数据库中，不再使用内存 Map
// const oauthStateStore = new Map<string, { mode: 'login' | 'bind'; provider: 'custom' | 'logto'; userId?: number; expiresAt: number }>();
const processingCallbacks = new Set<string>();
// 记录已成功处理的code，避免重复处理（最多保留1000个，避免内存泄漏）
const processedCodes = new Set<string>();
const MAX_PROCESSED_CODES = 1000;

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
  providerName: 'OIDC',
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

type OAuthUserProfile = Record<string, unknown>;

type LoginUserInfo = {
  id: number;
  username: string;
  nickname: string;
  email: string;
  role: 1 | 2 | 3;
  status: number;
};

function randomHex(size: number): string {
  return crypto.randomBytes(size).toString('hex');
}

function addProcessedCode(code: string): void {
  // 限制集合大小，避免内存泄漏
  if (processedCodes.size >= MAX_PROCESSED_CODES) {
    // 删除一些元素（Set没有顺序，所以转换为数组后删除前几个）
    const codesArray = Array.from(processedCodes);
    for (let i = 0; i < 10 && i < codesArray.length; i++) {
      processedCodes.delete(codesArray[i]);
    }
  }
  processedCodes.add(code);
}

function sanitizeConfigValue(value: string): string {
  // 去除 Markdown 反引号和多余空格
  return value.replace(/^`+|`+$/g, '').trim();
}

async function getOAuthConfigByProvider(provider: 'custom' | 'logto'): Promise<OAuthConfig> {
  const key = provider === 'logto' ? 'oauth_logto_config' : 'oauth_config';
  const defaults: OAuthConfig = provider === 'logto'
    ? { ...DEFAULT_OAUTH_CONFIG, template: 'logto', providerName: 'Logto' }
    : { ...DEFAULT_OAUTH_CONFIG, template: 'generic', providerName: 'Custom' };
  const value = await SettingsOperations.get(key);
  if (!value) return defaults;
  try {
    const parsed = JSON.parse(value) as Partial<OAuthConfig>;
    // 清洗 URL 字段，去除可能的 Markdown 反引号
    const sanitized: Partial<OAuthConfig> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && (k.includes('Endpoint') || k.includes('Uri') || k === 'issuer')) {
        sanitized[k as keyof OAuthConfig] = sanitizeConfigValue(v) as never;
      } else {
        sanitized[k as keyof OAuthConfig] = v as never;
      }
    }
    return { ...defaults, ...sanitized };
  } catch {
    return defaults;
  }
}

async function getEnabledOAuthProviders(): Promise<Array<{ key: 'custom' | 'logto'; providerName: string }>> {
  const providers: Array<{ key: 'custom' | 'logto'; providerName: string }> = [];
  const custom = await getOAuthConfigByProvider('custom');
  if (custom.enabled) providers.push({ key: 'custom', providerName: custom.providerName || 'OIDC' });
  const logto = await getOAuthConfigByProvider('logto');
  if (logto.enabled) providers.push({ key: 'logto', providerName: logto.providerName || 'Logto' });
  return providers;
}

function getProviderKey(config: OAuthConfig): string {
  return (config.providerName || 'oidc').trim().toLowerCase();
}

function assertOAuthEnabled(config: OAuthConfig): void {
  if (!config.enabled) {
    throw new Error('OAuth login is disabled');
  }
  if (!config.clientId || !config.clientSecret || !config.authorizationEndpoint || !config.tokenEndpoint || !config.userInfoEndpoint) {
    throw new Error('OAuth config is incomplete');
  }
}

async function exchangeOauthCode(config: OAuthConfig, code: string): Promise<{ accessToken: string; idToken?: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  });
  log.debug('OAuth', 'Token request', { endpoint: config.tokenEndpoint, body: body.toString() });
  try {
    const response = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    log.debug('OAuth', 'Token response', { status: response.status });
    const tokenPayload = await response.json() as { access_token?: string; id_token?: string; error?: string; error_description?: string };
    log.debug('OAuth', 'Token response payload', { payload: tokenPayload });
    if (!response.ok) {
      throw new Error(`OAuth token exchange failed: HTTP ${response.status}${tokenPayload.error_description ? ' - ' + tokenPayload.error_description : ''}`);
    }
    if (!tokenPayload.access_token) {
      throw new Error('OAuth token exchange failed: access_token missing');
    }
    return { accessToken: tokenPayload.access_token, idToken: tokenPayload.id_token || '' };
  } catch (error) {
    log.error('OAuth', 'Token request failed', { error: error instanceof Error ? error.message : String(error), endpoint: config.tokenEndpoint });
    throw error;
  }
}

async function fetchOAuthProfile(config: OAuthConfig, accessToken: string): Promise<OAuthUserProfile> {
  const response = await fetch(config.userInfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`OAuth userinfo failed: HTTP ${response.status}`);
  }
  const profile = await response.json() as OAuthUserProfile;
  return profile;
}

function getOAuthField(profile: OAuthUserProfile, field: string): string {
  const v = profile[field];
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return '';
}

function resolveOAuthSubject(config: OAuthConfig, profile: OAuthUserProfile): string {
  const candidates = [config.subjectKey, 'sub', 'id', 'user_id', 'uid']
    .map((s) => (s || '').trim())
    .filter(Boolean);
  for (const key of candidates) {
    const value = getOAuthField(profile, key);
    if (value) return value;
  }
  throw new Error(`OAuth userinfo missing subject key. Tried: ${candidates.join(', ')}`);
}

function resolveOAuthEmail(config: OAuthConfig, profile: OAuthUserProfile): string {
  const candidates = [config.emailKey, 'email', 'mail']
    .map((s) => (s || '').trim())
    .filter(Boolean);
  for (const key of candidates) {
    const value = getOAuthField(profile, key);
    if (value) return value.toLowerCase();
  }
  return '';
}

function buildOauthAuthUrl(config: OAuthConfig, state: string): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes || 'openid profile email',
    state,
  });
  return `${config.authorizationEndpoint}?${query.toString()}`;
}

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 ? '='.repeat(4 - (normalized.length % 4)) : '';
  return Buffer.from(normalized + pad, 'base64');
}

function ellipticSigToDer(r: Buffer, s: Buffer): Buffer {
  const rLen = r.length;
  const sLen = s.length;
  const totalLen = rLen + sLen + 10;
  const der = Buffer.alloc(totalLen);
  let offset = 0;
  der[offset++] = 0x30;
  der[offset++] = totalLen - 2;
  der[offset++] = 0x02;
  der[offset++] = rLen;
  r.copy(der, offset);
  offset += rLen;
  der[offset++] = 0x02;
  der[offset++] = sLen;
  s.copy(der, offset);
  return der.slice(0, offset + sLen);
}

async function verifyIdToken(idToken: string, config: OAuthConfig): Promise<OAuthUserProfile> {
  if (!idToken || !config.jwksUri) return {};
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid id_token format');
  const header = JSON.parse(decodeBase64Url(parts[0]).toString('utf8')) as { alg?: string; kid?: string };
  const payload = JSON.parse(decodeBase64Url(parts[1]).toString('utf8')) as Record<string, unknown>;

  log.debug('OAuth', 'id_token header', { header });
  log.debug('OAuth', 'id_token payload', { payload });
  log.debug('OAuth', 'Expected issuer', { issuer: config.issuer });
  log.debug('OAuth', 'Expected clientId', { clientId: config.clientId });
  log.debug('OAuth', 'JWKS URI', { jwksUri: config.jwksUri });

  if (!header.alg || !header.kid) throw new Error('id_token missing alg or kid');

  const jwksResp = await fetch(config.jwksUri);
  log.debug('OAuth', 'JWKS fetch status', { status: jwksResp.status });
  if (!jwksResp.ok) throw new Error(`JWKS fetch failed: HTTP ${jwksResp.status}`);
  const jwks = await jwksResp.json() as { keys?: Array<Record<string, unknown>> };
  log.debug('OAuth', 'JWKS keys count', { count: jwks.keys?.length });
  log.debug('OAuth', 'JWKS keys', { keys: jwks.keys?.map(k => ({ kid: k.kid, alg: k.alg, kty: k.kty })) });

  const jwk = (jwks.keys || []).find((key) => String(key.kid || '') === header.kid);
  log.debug('OAuth', 'Matched JWK', { jwk: jwk ? { kid: jwk.kid, alg: jwk.alg, kty: jwk.kty } : 'NOT FOUND' });
  if (!jwk) throw new Error('Unable to find matching JWKS key for id_token');

  const verifyAlgMap: Record<string, string> = {
    RS256: 'RSA-SHA256',
    RS384: 'RSA-SHA384',
    RS512: 'RSA-SHA512',
    ES256: 'sha256',
    ES384: 'sha384',
    ES512: 'sha512',
  };
  const verifyAlg = verifyAlgMap[header.alg];
  log.debug('OAuth', 'Using verify algorithm', { verifyAlg });
  if (!verifyAlg) throw new Error(`Unsupported id_token algorithm: ${header.alg}`);
  const publicKey = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: 'jwk' });
  const signingInput = `${parts[0]}.${parts[1]}`;
  let signature = decodeBase64Url(parts[2]);
  log.debug('OAuth', 'Original signature length', { length: signature.length });

  if (header.alg.startsWith('ES') && jwk.kty === 'EC') {
    const keySize = header.alg === 'ES256' ? 32 : header.alg === 'ES384' ? 48 : 66;
    if (signature.length === keySize * 2) {
      const r = signature.slice(0, keySize);
      const s = signature.slice(keySize);
      signature = ellipticSigToDer(r, s);
      log.debug('OAuth', 'Converted ECDSA signature to DER format', { newLength: signature.length });
    }
  }

  const ok = crypto.verify(verifyAlg, Buffer.from(signingInput), publicKey, signature);
  log.debug('OAuth', 'Signature verification result', { ok });
  if (!ok) throw new Error('id_token signature verification failed');

  const now = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp || 0);
  if (exp && exp < now) throw new Error('id_token expired');
  if (payload.aud && payload.aud !== config.clientId && !(Array.isArray(payload.aud) && payload.aud.includes(config.clientId))) {
    throw new Error('id_token audience mismatch');
  }
  if (config.issuer && payload.iss && payload.iss !== config.issuer) {
    throw new Error('id_token issuer mismatch');
  }
  return payload;
}

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with username/email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username or email address
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: JWT token returned
 */
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const { username, password, totpCode, backupCode, webauthnResponse, trustDevice } = req.body as { 
    username: string; 
    password: string; 
    totpCode?: string; 
    backupCode?: string; 
    webauthnResponse?: any;
    trustDevice?: boolean;
  };
  if (!username || !password) {
    res.json({ code: -1, msg: 'Username/email and password are required' });
    return;
  }

  try {
    // Check if input is an email (contains @)
    const isEmail = username.includes('@');
    
    // Get the identifier for login limit check (use username if found, otherwise use the input)
    let loginIdentifier = username.toLowerCase();
    
    // Check login limit
    const ipAddress = getRequestIP(req);
    const limitCheck = await checkLoginAllowed(loginIdentifier, ipAddress);
    if (!limitCheck.allowed) {
      res.json({ code: -1, msg: limitCheck.message || 'Account is temporarily locked' });
      return;
    }
    
    let user: User | undefined;
    if (isEmail) {
      // Login with email
      user = await UserOperations.getByEmail(username) as User | undefined;
    } else {
      // Login with username
      user = await UserOperations.getByUsername(username) as User | undefined;
    }

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      // Record failed attempt
      const failedResult = await recordFailedAttempt(loginIdentifier, ipAddress);
      if (failedResult.locked) {
        res.json({ code: -1, msg: failedResult.message || 'Account is temporarily locked' });
      } else {
        res.json({ code: -1, msg: `Invalid username/email or password. ${failedResult.message || ''}`.trim() });
      }
      return;
    }
    if (user.status === 0) {
      res.json({ code: -1, msg: 'Account is disabled' });
      return;
    }

    // Check 2FA
    const totpStatus = await getTOTPStatus(user.id);
    const isWebauthnEnabled = await TwoFAOperations.isWebAuthnEnabled(user.id);
    const isTotpEnabled = totpStatus.enabled;
    const has2FA = isTotpEnabled || isWebauthnEnabled;
    
    // 检查是否需要强制 2FA
    const force2FA = await requires2FA(user.id);
    const userHas2FA = await has2FAEnabled(user.id);
    
    // 如果强制 2FA 但用户未设置，要求先设置 2FA
    if (force2FA && !userHas2FA) {
      res.json({ 
        code: -3, 
        msg: '2FA setup required', 
        data: { require2FASetup: true } 
      });
      return;
    }

    if (has2FA) {
      if (backupCode) {
        const isValid = await verifyBackupCode(user.id, backupCode);
        if (!isValid) {
          res.json({ code: -1, msg: 'Invalid backup code' });
          return;
        }
      } else if (totpCode && isTotpEnabled) {
        const secret = await TwoFAOperations.getTOTPSecret(user.id);
        if (!secret || !verifyTOTPToken(secret, totpCode)) {
          res.json({ code: -1, msg: 'Invalid 2FA code' });
          return;
        }
      } else if (webauthnResponse && isWebauthnEnabled) {
        // webauthnResponse verification is handled by another endpoint or we verify it here
        const expectedChallenge = (global as any).loginChallengeStore?.get(user.id);
        if (!expectedChallenge) {
          res.json({ code: -1, msg: 'WebAuthn challenge expired or missing' });
          return;
        }
        
        const { verifyAuthenticationResponse } = require('@simplewebauthn/server');
        const { getUserWebAuthnCredentials, updateWebAuthnCredentialCounter } = require('../service/webauthn');
        const userCreds = await getUserWebAuthnCredentials(user.id);
        const cred = userCreds.find((c: any) => c.id === webauthnResponse.id);
        if (!cred) {
          res.json({ code: -1, msg: 'Credential not found' });
          return;
        }
        
        try {
          const verification = await verifyAuthenticationResponse({
            response: webauthnResponse,
            expectedChallenge,
            expectedOrigin: process.env.WEBAUTHN_ORIGIN || `http://${process.env.WEBAUTHN_RP_ID || 'localhost'}:3000`,
            expectedRPID: process.env.WEBAUTHN_RP_ID || 'localhost',
            authenticator: {
              credentialID: cred.id,
              credentialPublicKey: Buffer.from(cred.public_key, 'base64'),
              counter: cred.counter,
              transports: cred.transports,
            },
          });
          
          if (!verification.verified) {
            res.json({ code: -1, msg: 'WebAuthn verification failed' });
            return;
          }
          await updateWebAuthnCredentialCounter(cred.id, verification.authenticationInfo.newCounter);
          (global as any).loginChallengeStore.delete(user.id);
        } catch (e: any) {
          res.json({ code: -1, msg: e.message });
          return;
        }
      } else {
        // 2FA required
        const types = [];
        if (isTotpEnabled) types.push('totp');
        if (isWebauthnEnabled) types.push('webauthn');
        res.json({ code: -2, msg: '2FA required', data: { require2FA: true, types } });
        return;
      }
    }

    // Clear login attempts on successful login
    await clearLoginAttempts(loginIdentifier);
    
    // 如果用户选择信任设备，添加设备信任
    let deviceId: string | undefined;
    if (trustDevice && has2FA) {
      const deviceInfo: DeviceInfo = {
        userAgent: req.headers['user-agent'] || '',
        ipAddress: getRequestIP(req),
      };
      deviceId = await addTrustedDevice(user.id, deviceInfo);
    }
    
    const token = await signToken({ userId: user.id, username: user.username, nickname: user.nickname, role: user.role });
    res.json({
      code: 0,
      data: { 
        token, 
        user: { id: user.id, username: user.username, nickname: user.nickname, email: user.email, role: user.role },
        deviceId,
        require2FASetup: force2FA && !userHas2FA,
      },
      msg: 'success',
    });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Login failed' });
  }
});

/**
 * @swagger
 * /api/auth/oauth/status:
 *   get:
 *     summary: Get OAuth configuration status
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: OAuth status returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: number
 *                 data:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: boolean
 *                     providerName:
 *                       type: string
 *                     providers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key:
 *                             type: string
 *                           providerName:
 *                             type: string
 *                 msg:
 *                   type: string
 */
router.get('/oauth/status', async (_req: Request, res: Response) => {
  try {
    const providers = await getEnabledOAuthProviders();
    res.json({
      code: 0,
      data: { enabled: providers.length > 0, providerName: providers[0]?.providerName || 'OIDC', providers },
      msg: 'success'
    });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get oauth status' });
  }
});

/**
 * @swagger
 * /api/auth/oauth/start:
 *   post:
 *     summary: Start OAuth login flow
 *     tags: [Auth]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: ['custom', 'logto']
 *                 default: 'custom'
 *     responses:
 *       200:
 *         description: OAuth authorization URL returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: number
 *                 data:
 *                   type: object
 *                   properties:
 *                     authUrl:
 *                       type: string
 *                 msg:
 *                   type: string
 *       400:
 *         description: OAuth not enabled or configuration error
 */
router.post('/oauth/start', async (req: Request, res: Response) => {
  try {
    const desired = (req.body?.provider as 'custom' | 'logto' | undefined) || 'custom';
    const config = await getOAuthConfigByProvider(desired);
    assertOAuthEnabled(config);

    // Force redirectUri to use the fixed callback endpoint
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = `${protocol}://${host}`;
    config.redirectUri = `${baseUrl}/oauth/callback`;

    const state = randomHex(24);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await OAuthOperations.createState(state, 'login', desired, null, expiresAt);
    log.debug('OAuth', 'State created for login', { state: state.substring(0, 10) + '...', provider: desired, expiresAt: expiresAt.toISOString() });
    res.json({ code: 0, data: { authUrl: buildOauthAuthUrl(config, state) }, msg: 'success' });
  } catch (error) {
    res.status(400).json({ code: 400, msg: error instanceof Error ? error.message : 'Failed to start oauth flow' });
  }
});

/**
 * @swagger
 * /api/auth/oauth/start-bind:
 *   post:
 *     summary: Start OAuth bind flow for current user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: ['custom', 'logto']
 *                 default: 'custom'
 *     responses:
 *       200:
 *         description: OAuth authorization URL returned
 *       400:
 *         description: OAuth not enabled
 *       401:
 *         description: Unauthorized
 */
router.post('/oauth/start-bind', authMiddleware, async (req: Request, res: Response) => {
  // 最早期日志，确认请求到达
  log.debug('OAuth', '>>> /oauth/start-bind ENTRY', { userId: req.user?.userId, body: req.body });
  try {
    const desired = (req.body?.provider as 'custom' | 'logto' | undefined) || 'custom';
    log.debug('OAuth', 'Start bind request received', { provider: desired, userId: req.user!.userId });

    const config = await getOAuthConfigByProvider(desired);
    assertOAuthEnabled(config);

    // Force redirectUri to use the fixed callback endpoint
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = `${protocol}://${host}`;
    config.redirectUri = `${baseUrl}/oauth/callback`;

    const state = randomHex(24);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await OAuthOperations.createState(state, 'bind', desired, req.user!.userId, expiresAt);
    log.debug('OAuth', 'State created for bind', {
      state: state.substring(0, 16) + '...',
      provider: desired,
      userId: req.user!.userId,
      expiresAt: expiresAt.toISOString()
    });
    res.json({ code: 0, data: { authUrl: buildOauthAuthUrl(config, state) }, msg: 'success' });
  } catch (error) {
    log.error('OAuth', 'Failed to start bind', { error: error instanceof Error ? error.message : String(error) });
    res.status(400).json({ code: 400, msg: error instanceof Error ? error.message : 'Failed to start oauth bind flow' });
  }
});

/**
 * @swagger
 * /api/auth/oauth/callback:
 *   post:
 *     summary: OAuth callback endpoint
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - state
 *             properties:
 *               code:
 *                 type: string
 *                 description: Authorization code from OAuth provider
 *               state:
 *                 type: string
 *                 description: State parameter for CSRF protection
 *     responses:
 *       200:
 *         description: Login successful or bind successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: number
 *                 data:
 *                   type: object
 *                   properties:
 *                     mode:
 *                       type: string
 *                       enum: ['login', 'bind']
 *                     token:
 *                       type: string
 *                     user:
 *                       type: object
 *                 msg:
 *                   type: string
 *       400:
 *         description: Invalid parameters or expired state
 *       403:
 *         description: Account not bound or disabled
 */
router.post('/oauth/callback', async (req: Request, res: Response) => {
  const { code, state } = req.body as { code?: string; state?: string };
  log.debug('OAuth', 'Callback received', { code: code?.substring(0, 16) + '...', state: state?.substring(0, 16) + '...' });
  
  if (!code || !state) {
    log.warn('OAuth', 'Missing code or state', { hasCode: !!code, hasState: !!state });
    res.status(400).json({ code: 400, msg: 'code and state are required' });
    return;
  }
  
  // 检查是否正在处理相同的回调（防止重复请求）
  const callbackKey = `${code}:${state}`;
  if (processingCallbacks.has(callbackKey)) {
    log.warn('OAuth', 'Duplicate callback detected, ignoring', { state: state.substring(0, 16) + '...' });
    res.status(429).json({ code: 429, msg: 'Callback is being processed, please wait' });
    return;
  }

  processingCallbacks.add(callbackKey);

  try {
    log.debug('OAuth', 'State store lookup', { lookingFor: state.substring(0, 16) + '...' });

    // 从数据库获取并删除 state（一次性使用）
    const stateEntry = await OAuthOperations.getAndDeleteState(state);

    if (!stateEntry) {
      log.warn('OAuth', 'State not found in store', { state: state.substring(0, 16) + '...', code: code?.substring(0, 16) + '...' });
      
      // 检查这个code是否已经被处理过
      if (processedCodes.has(code)) {
        log.info('OAuth', 'Code already processed, returning success', { code: code?.substring(0, 16) + '...' });
        // 如果已经处理过，返回成功（幂等性）
        // 对于绑定模式，返回成功
        // 对于登录模式，需要检查用户是否已经登录，但这里简单返回成功
        addProcessedCode(code); // 确保记录code（虽然已经存在，但更新访问时间）
        res.json({ code: 0, data: { mode: 'login' }, msg: 'OAuth flow already completed' });
        return;
      }
      
      // 可能正在处理中，等待一小段时间后重试
      log.info('OAuth', 'State not found but may be processing, waiting...', { state: state.substring(0, 16) + '...' });
      
      // 等待1秒，让第一个请求有机会完成
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 再次检查是否已经被处理
      if (processedCodes.has(code)) {
        log.info('OAuth', 'Code processed after waiting, returning success', { code: code?.substring(0, 16) + '...' });
        addProcessedCode(code);
        res.json({ code: 0, data: { mode: 'login' }, msg: 'OAuth flow completed after retry' });
        return;
      }
      
      res.status(400).json({ code: 400, msg: 'Invalid oauth state - state not found. Server may have restarted or callback was already processed.' });
      return;
    }

    log.debug('OAuth', 'State found and removed', { state: state.substring(0, 16) + '...' });

    if (new Date() > stateEntry.expiresAt) {
      log.warn('OAuth', 'State expired', { state: state.substring(0, 16) + '...', expiredAt: stateEntry.expiresAt.toISOString() });
      res.status(400).json({ code: 400, msg: 'Expired oauth state' });
      return;
    }

    log.debug('OAuth', 'State validated', { mode: stateEntry.mode, provider: stateEntry.provider, userId: stateEntry.userId });

    // 处理成功后立即清理标记（后续代码可能耗时较长）
    processingCallbacks.delete(callbackKey);

    const config = await getOAuthConfigByProvider(stateEntry.provider);
    assertOAuthEnabled(config);
    const provider = stateEntry.provider;
    
    // Force redirectUri to use the fixed callback endpoint
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = `${protocol}://${host}`;
    config.redirectUri = `${baseUrl}/oauth/callback`;
    
    const tokenResult = await exchangeOauthCode(config, code);
    const profile = await fetchOAuthProfile(config, tokenResult.accessToken);
    // ID Token 验证（可选，失败不阻断流程）
    let idTokenClaims: OAuthUserProfile = {};
    if (tokenResult.idToken) {
      try {
        idTokenClaims = await verifyIdToken(tokenResult.idToken, config);
      } catch (idTokenError) {
        log.warn('OAuth', 'ID Token verification failed, continuing with profile only', { error: idTokenError instanceof Error ? idTokenError.message : String(idTokenError) });
      }
    }
    const mergedProfile = { ...idTokenClaims, ...profile };
    const subject = resolveOAuthSubject(config, mergedProfile);
    const normalizedEmail = resolveOAuthEmail(config, mergedProfile);
    
    // Get provider key for database lookup
    const providerKey = getProviderKey(config);
    
    const existingLink = await OAuthOperations.getUserByProviderSubject(providerKey, subject);

    if (stateEntry.mode === 'bind') {
      const currentUserId = stateEntry.userId;
      if (!currentUserId) {
        res.status(401).json({ code: 401, msg: 'Unauthorized' });
        return;
      }
      if (existingLink && existingLink.id !== currentUserId) {
        res.status(409).json({ code: 409, msg: 'This OAuth account is already bound to another user' });
        return;
      }
      if (existingLink && existingLink.id === currentUserId) {
        addProcessedCode(code);
        res.json({ code: 0, data: { mode: 'bind' }, msg: 'success' });
        return;
      }
      await OAuthOperations.create(currentUserId, providerKey, subject, normalizedEmail);
      await logAuditOperation(currentUserId, 'bind_oauth_account', 'system', { provider: providerKey, subject, email: normalizedEmail });
      addProcessedCode(code);
      res.json({ code: 0, data: { mode: 'bind' }, msg: 'success' });
      return;
    }

    const user = existingLink as LoginUserInfo | undefined;

    if (!user) {
      res.status(403).json({ code: 403, msg: 'OAuth account is not bound. Please bind it in account settings first.' });
      return;
    }
    if (user.status === 0) {
      res.status(403).json({ code: 403, msg: 'Account is disabled' });
      return;
    }

    const token = await signToken({ userId: user.id, username: user.username, nickname: user.nickname, role: user.role });
    await logAuditOperation(user.id, 'oauth_login', 'system', { provider: providerKey });
    addProcessedCode(code);
    res.json({
      code: 0,
      data: { mode: 'login', token, user: { id: user.id, username: user.username, nickname: user.nickname, email: user.email, role: user.role } },
      msg: 'success',
    });
  } catch (error) {
    log.error('OAuth', 'Callback processing failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'OAuth callback failed' });
  } finally {
    // 清理处理标记
    processingCallbacks.delete(`${code}:${state}`);
  }
});

router.get('/oauth/bindings', authMiddleware, async (req: Request, res: Response) => {
  try {
    const list = await OAuthOperations.getByUserId(req.user!.userId);
    res.json({ code: 0, data: list, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get oauth bindings' });
  }
});

router.delete('/oauth/bindings/:provider', authMiddleware, async (req: Request, res: Response) => {
  try {
    const provider = (req.params.provider || '').trim().toLowerCase();
    if (!provider) {
      res.status(400).json({ code: 400, msg: 'provider is required' });
      return;
    }
    await OAuthOperations.delete(req.user!.userId, provider);
    await logAuditOperation(req.user!.userId, 'unbind_oauth_account', 'system', { provider });
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to unbind oauth account' });
  }
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user (first user becomes admin)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *               nickname:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: User created
 */
router.post('/register', registerLimiter, async (req: Request, res: Response) => {
  const { username, nickname, email = '', password } = req.body as { username: string; nickname?: string; email?: string; password: string };
  const normalizedUsername = (username ?? '').trim();
  if (!normalizedUsername || !password) {
    res.json({ code: -1, msg: 'Username and password are required' });
    return;
  }
  if (!isValidUsername(normalizedUsername)) {
    res.json({ code: -1, msg: 'Username must use letters, numbers, "_" or "-"' });
    return;
  }

  // 验证密码强度
  const passwordCheck = await validatePassword(password);
  if (!passwordCheck.valid) {
    res.json({ code: -1, msg: passwordCheck.message });
    return;
  }

  try {
    const count = await UserOperations.getCount();

    const role = count === 0 ? ROLE_SUPER : ROLE_USER;
    const hash = bcrypt.hashSync(password, 10);
    const resolvedNickname = (nickname ?? '').trim() || normalizedUsername;

    const roleText = role >= 2 ? 'admin' : 'member';

    const id = await UserOperations.create({
      username: normalizedUsername,
      nickname: resolvedNickname,
      email: email,
      password_hash: hash,
      role: roleText,
      role_level: role
    });
    res.json({ code: 0, data: { id, username: normalizedUsername, nickname: resolvedNickname, role }, msg: 'success' });
  } catch {
    res.json({ code: -1, msg: 'Username already exists' });
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user info
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user info
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await UserOperations.getPublicById(req.user!.userId);

    if (!user) {
      res.json({ code: -1, msg: 'User not found' });
      return;
    }
    res.json({ code: 0, data: user, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get user info' });
  }
});

/**
 * @swagger
 * /api/auth/password:
 *   put:
 *     summary: Change current user password
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed
 */
router.put('/password', authMiddleware, async (req: Request, res: Response) => {
  const { oldPassword, newPassword } = req.body as { oldPassword: string; newPassword: string };
  if (!oldPassword || !newPassword) {
    res.json({ code: -1, msg: 'Old and new passwords are required' });
    return;
  }

  try {
    const user = await UserOperations.getById(req.user!.userId);

    if (!user || !bcrypt.compareSync(oldPassword, user.password_hash as string)) {
      res.json({ code: -1, msg: 'Old password is incorrect' });
      return;
    }
    
    // 验证新密码强度
    const passwordCheck = await validatePassword(newPassword);
    if (!passwordCheck.valid) {
      res.json({ code: -1, msg: passwordCheck.message });
      return;
    }
    
    const hash = bcrypt.hashSync(newPassword, 10);

    await UserOperations.updatePassword(user.id as number, hash);
    
    // 修改密码后清除所有受信任设备
    const { removeAllUserTrustedDevices } = require('../service/deviceTrust');
    await removeAllUserTrustedDevices(user.id as number);

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to change password' });
  }
});

/**
 * @swagger
 * /api/auth/profile:
 *   put:
 *     summary: Update current user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.put('/profile', authMiddleware, async (req: Request, res: Response) => {
  const { nickname, email, emailCode } = req.body as { nickname?: string; email?: string; emailCode?: string };
  if (nickname === undefined && email === undefined) {
    res.json({ code: -1, msg: 'Nothing to update' });
    return;
  }

  try {
    const user = await UserOperations.getById(req.user!.userId);

    if (!user) {
      res.json({ code: -1, msg: 'User not found' });
      return;
    }

    const updates: Record<string, unknown> = {};

    if (nickname !== undefined) {
      updates.nickname = nickname.trim() || user.username;
    }
    if (email !== undefined) {
      const nextEmail = email.trim();
      if (nextEmail !== user.email) {
        if (!emailCode || !verifyEmailVerificationCode(user.id as number, nextEmail, emailCode)) {
          res.status(400).json({ code: 400, msg: 'Valid email verification code is required' });
          return;
        }
      }
      updates.email = nextEmail;
    }

    await UserOperations.update(user.id as number, updates);
    const updatedResult = await UserOperations.getPublicById(user.id as number);
    if (email !== undefined && email.trim() !== user.email) {
      await logAuditOperation(user.id as number, 'update_profile_email', 'system', { oldEmail: user.email, newEmail: email.trim() });
    }
    res.json({ code: 0, data: updatedResult, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to update profile' });
  }
});

router.post('/profile/email-code', authMiddleware, emailLimiter, async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) {
    res.status(400).json({ code: 400, msg: 'Email is required' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    res.status(400).json({ code: 400, msg: 'Invalid email format' });
    return;
  }
  try {
    await sendEmailVerificationCode(req.user!.userId, normalized);
    await logAuditOperation(req.user!.userId, 'send_email_verification_code', 'system', { email: normalized });
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to send verification code' });
  }
});

router.post('/password-reset/request', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) {
    res.status(400).json({ code: 400, msg: 'Email is required' });
    return;
  }
  try {
    const smtpCfg = await getSmtpConfig();
    if (!smtpCfg.enabled) {
      res.status(400).json({ code: 400, msg: 'Password reset by email is unavailable: SMTP is not configured' });
      return;
    }
    const user = await UserOperations.getByEmail(normalized);
    if (user) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      resetStore.set(normalized, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
      await sendSmtpEmail(normalized, 'DNSMgr Password Reset Code', `Hi ${user.username},\n\nYour password reset code is: ${code}\nThis code will expire in 10 minutes.`);
      await logAuditOperation(user.id as number, 'send_password_reset_code', 'system', { email: normalized });
    }
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to send password reset code' });
  }
});

router.post('/password-reset/confirm', async (req: Request, res: Response) => {
  const { email, code, newPassword } = req.body as { email?: string; code?: string; newPassword?: string };
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized || !code || !newPassword) {
    res.status(400).json({ code: 400, msg: 'Email, code and newPassword are required' });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ code: 400, msg: 'Password must be at least 6 characters' });
    return;
  }
  const entry = resetStore.get(normalized);
  if (!entry || entry.code !== code.trim() || Date.now() > entry.expiresAt) {
    res.status(400).json({ code: 400, msg: 'Invalid or expired reset code' });
    return;
  }
  try {
    const user = await UserOperations.getByEmail(normalized);
    if (!user) {
      res.status(400).json({ code: 400, msg: 'Email not found' });
      return;
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    await UserOperations.updatePassword(user.id as number, hash);
    resetStore.delete(normalized);
    await logAuditOperation(user.id as number, 'reset_password_by_email', 'system', { email: normalized });
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to reset password' });
  }
});

/**
 * @swagger
 * /api/auth/preferences:
 *   get:
 *     summary: Get current user preferences
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User preferences
 */
router.get('/preferences', authMiddleware, async (req: Request, res: Response) => {
  try {
    const preferences = await getUserPreferences(req.user!.userId);
    res.json({
      code: 0,
      data: {
        theme: preferences.theme,
        language: preferences.language,
        notificationsEnabled: preferences.notificationsEnabled,
        emailNotifications: preferences.emailNotifications,
        backgroundImage: preferences.backgroundImage,
      },
      msg: 'success',
    });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get preferences' });
  }
});

/**
 * @swagger
 * /api/auth/preferences:
 *   put:
 *     summary: Update current user preferences
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               theme:
 *                 type: string
 *                 enum: ['light', 'dark', 'auto']
 *               language:
 *                 type: string
 *               notificationsEnabled:
 *                 type: boolean
 *               emailNotifications:
 *                 type: boolean
 *               backgroundImage:
 *                 type: string
 *                 description: Custom background image URL
 *     responses:
 *       200:
 *         description: Preferences updated
 */
router.put('/preferences', authMiddleware, async (req: Request, res: Response) => {
  const { theme, language, notificationsEnabled, emailNotifications, backgroundImage } = req.body as Partial<UserPreferences>;

  try {
    const updates: Partial<UserPreferences> = {};
    if (theme !== undefined) updates.theme = theme;
    if (language !== undefined) updates.language = language;
    if (notificationsEnabled !== undefined) updates.notificationsEnabled = notificationsEnabled;
    if (emailNotifications !== undefined) updates.emailNotifications = emailNotifications;
    if (backgroundImage !== undefined) updates.backgroundImage = backgroundImage;

    await updateUserPreferences(req.user!.userId, updates);
    await logAuditOperation(req.user!.userId, 'update_preferences', 'system', updates);
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to update preferences' });
  }
});

/**
 * Get user's pinned domains
 */
router.get('/preferences/pinned-domains', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pinnedDomains = await UserPreferencesOperations.getPinnedDomains(req.user!.userId);
    res.json({ code: 0, data: { pinnedDomains } });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get pinned domains' });
  }
});

/**
 * Update user's pinned domains
 */
router.put('/preferences/pinned-domains', authMiddleware, async (req: Request, res: Response) => {
  const { domainIds } = req.body as { domainIds?: number[] };
  
  if (!Array.isArray(domainIds)) {
    res.status(400).json({ code: 400, msg: 'domainIds must be an array' });
    return;
  }
  
  try {
    await UserPreferencesOperations.updatePinnedDomains(req.user!.userId, domainIds);
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to update pinned domains' });
  }
});

export default router;
