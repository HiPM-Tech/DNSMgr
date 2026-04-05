import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JwtPayload } from '../types';
import { isAdmin, normalizeRole } from '../utils/roles';
import { getCurrentConnection } from '../db/database';
import { verifyToken, hasServicePermission, hasDomainPermission } from '../service/token';
import { TokenPayload } from '../types/token';

// JWT密钥配置 - 生产环境必须设置JWT_SECRET
const BASE_JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  
  // 生产环境强制要求设置JWT_SECRET
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret === 'dnsmgr-secret-key') {
      console.error('[ERROR] JWT_SECRET environment variable is not set or using insecure default in production!');
      console.error('[ERROR] Please set a secure JWT_SECRET (at least 32 characters) in your environment.');
      process.exit(1);
    }
  }
  
  // 非生产环境使用默认值（仅用于开发）
  if (!secret) {
    console.warn('[WARN] JWT_SECRET not set, using insecure default. Set JWT_SECRET for better security.');
    return 'dnsmgr-secret-key';
  }
  
  return secret;
})();

const RUNTIME_SECRET_KEY = 'jwt_runtime';
let runtimeSecretCache: string | null = null;

async function getRuntimeSecret(): Promise<string> {
  if (runtimeSecretCache) return runtimeSecretCache;
  
  const conn = getCurrentConnection();
  if (!conn) {
    // No connection available, generate a temporary secret
    const generated = crypto.randomBytes(32).toString('hex');
    runtimeSecretCache = generated;
    return generated;
  }
  
  try {
    if (conn.type === 'sqlite') {
      const sqliteConn = conn as any;
      const row = sqliteConn.prepare('SELECT value FROM runtime_secrets WHERE key = ?').get(RUNTIME_SECRET_KEY) as { value: string } | undefined;
      if (row?.value) {
        runtimeSecretCache = row.value;
        return row.value;
      }
    } else {
      const result = await conn.get('SELECT value FROM runtime_secrets WHERE key = ?', [RUNTIME_SECRET_KEY]);
      const row = result as { value: string } | undefined;
      if (row?.value) {
        runtimeSecretCache = row.value;
        return row.value;
      }
    }
  } catch {
    // Table might not exist, will create below
  }
  
  // Fallback in case initSchema has not rotated secrets yet.
  const generated = crypto.randomBytes(32).toString('hex');
  
  try {
    if (conn.type === 'sqlite') {
      const sqliteConn = conn as any;
      sqliteConn.exec(`
        CREATE TABLE IF NOT EXISTS runtime_secrets (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      sqliteConn.prepare('INSERT OR REPLACE INTO runtime_secrets (key, value) VALUES (?, ?)').run(RUNTIME_SECRET_KEY, generated);
    } else if (conn.type === 'mysql') {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS runtime_secrets (
          \`key\` VARCHAR(255) PRIMARY KEY,
          \`value\` TEXT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await conn.execute('INSERT INTO runtime_secrets (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?', [RUNTIME_SECRET_KEY, generated, generated]);
    } else {
      // PostgreSQL
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS runtime_secrets (
          "key" VARCHAR(255) PRIMARY KEY,
          "value" TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await conn.execute(`
        INSERT INTO runtime_secrets ("key", "value") VALUES ($1, $2)
        ON CONFLICT ("key") DO UPDATE SET "value" = $2
      `, [RUNTIME_SECRET_KEY, generated]);
    }
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
