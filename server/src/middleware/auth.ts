import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JwtPayload } from '../types';
import { isAdmin, normalizeRole } from '../utils/roles';
import { get, execute, query } from '../db';
import { verifyToken, hasServicePermission, hasDomainPermission } from '../service/token';
import { TokenPayload } from '../types/token';

// JWT密钥配置 - 如果没有设置则随机生成
const BASE_JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  
  // 如果设置了环境变量，使用环境变量
  if (secret) {
    // 生产环境检查密钥强度
    if (process.env.NODE_ENV === 'production' && secret.length < 32) {
      console.error('[ERROR] JWT_SECRET must be at least 32 characters long in production!');
      process.exit(1);
    }
    return secret;
  }
  
  // 如果没有设置，生成随机密钥（每次重启服务会变化，仅适合开发环境）
  const generatedSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[WARN] JWT_SECRET not set, using randomly generated secret.');
  console.warn('[WARN] For production, please set JWT_SECRET environment variable to ensure token persistence across restarts.');
  return generatedSecret;
})();

const RUNTIME_SECRET_KEY = 'jwt_runtime';
let runtimeSecretCache: string | null = null;

async function getRuntimeSecret(): Promise<string> {
  if (runtimeSecretCache) return runtimeSecretCache;
  
  try {
    const row = await get<{ value: string }>('SELECT value FROM runtime_secrets WHERE key = ?', [RUNTIME_SECRET_KEY]);
    if (row?.value) {
      runtimeSecretCache = row.value;
      return row.value;
    }
  } catch {
    // Table might not exist, will create below
  }
  
  // Fallback in case initSchema has not rotated secrets yet.
  const generated = crypto.randomBytes(32).toString('hex');
  
  try {
    // Try to create table and insert
    await execute(`
      CREATE TABLE IF NOT EXISTS runtime_secrets (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await execute(
      'INSERT INTO runtime_secrets (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [RUNTIME_SECRET_KEY, generated]
    );
  } catch (e) {
    console.error('[Auth] Error creating runtime_secrets table:', e);
  }
  
  runtimeSecretCache = generated;
  return generated;
}

async function getJwtSecret(): Promise<string> {
  const runtimeSecret = await getRuntimeSecret();
  return `${BASE_JWT_SECRET}:${runtimeSecret}`;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ code: -1, msg: 'Unauthorized' });
    return;
  }
  const token = header.slice(7);
  
  // First try to verify as JWT
  try {
    const jwtSecret = await getJwtSecret();
    const payload = jwt.verify(token, jwtSecret) as JwtPayload;
    req.user = { ...payload, role: normalizeRole(payload.role) };
    next();
    return;
  } catch {
    // Not a valid JWT, try user token
  }
  
  // Try to verify as user token
  const tokenPayload = await verifyToken(token);
  if (tokenPayload) {
    // Convert token payload to user payload
    req.user = {
      userId: tokenPayload.userId,
      username: `token:${tokenPayload.tokenId}`,
      role: tokenPayload.maxRole as 1 | 2 | 3,
    };
    // Store token payload for permission checks
    (req as any).tokenPayload = tokenPayload;
    next();
    return;
  }
  
  res.status(401).json({ code: -1, msg: 'Invalid or expired token' });
}

// Middleware to check token service permission
export function requireServicePermission(service: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const tokenPayload = (req as any).tokenPayload as TokenPayload | undefined;
    
    // If not using token auth, allow (JWT auth has its own checks)
    if (!tokenPayload) {
      next();
      return;
    }
    
    if (!hasServicePermission(tokenPayload, service)) {
      res.status(403).json({ code: -1, msg: `Token does not have permission for ${service}` });
      return;
    }
    
    next();
  };
}

// Middleware to check token domain permission
export function requireDomainPermission(getDomainId: (req: Request) => number | null) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tokenPayload = (req as any).tokenPayload as TokenPayload | undefined;

    // If not using token auth, allow
    if (!tokenPayload) {
      next();
      return;
    }

    const domainId = getDomainId(req);
    if (domainId !== null && !(await hasDomainPermission(tokenPayload, domainId))) {
      res.status(403).json({ code: -1, msg: 'Token does not have permission for this domain' });
      return;
    }

    next();
  };
}

export function adminOnly(req: Request, res: Response, next: NextFunction): void {
  if (!isAdmin(req.user?.role)) {
    res.status(403).json({ code: -1, msg: 'Admin access required' });
    return;
  }
  next();
}

export async function signToken(payload: JwtPayload): Promise<string> {
  const jwtSecret = await getJwtSecret();
  return jwt.sign(payload, jwtSecret, { expiresIn: '7d' });
}
