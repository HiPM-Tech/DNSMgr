import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JwtPayload } from '../types';
import { isAdmin, normalizeRole } from '../utils/roles';
import { getDb } from '../db/database';

const BASE_JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.warn('[WARN] JWT_SECRET environment variable is not set. Using insecure default. Set JWT_SECRET in production!');
  }
  return 'dnsmgr-secret-key';
})();

const RUNTIME_SECRET_KEY = 'jwt_runtime';
let runtimeSecretCache: string | null = null;

function getRuntimeSecret(): string {
  if (runtimeSecretCache) return runtimeSecretCache;
  const db = getDb();
  try {
    const row = db.prepare('SELECT value FROM runtime_secrets WHERE key = ?').get(RUNTIME_SECRET_KEY) as { value: string } | undefined;
    if (row?.value) {
      runtimeSecretCache = row.value;
      return row.value;
    }
  } catch {
    db.exec(`
      CREATE TABLE IF NOT EXISTS runtime_secrets (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
  // Fallback in case initSchema has not rotated secrets yet.
  const generated = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT OR REPLACE INTO runtime_secrets (key, value) VALUES (?, ?)').run(RUNTIME_SECRET_KEY, generated);
  runtimeSecretCache = generated;
  return generated;
}

function getJwtSecret(): string {
  return `${BASE_JWT_SECRET}:${getRuntimeSecret()}`;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ code: -1, msg: 'Unauthorized' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as JwtPayload;
    req.user = { ...payload, role: normalizeRole(payload.role) };
    next();
  } catch {
    res.status(401).json({ code: -1, msg: 'Invalid or expired token' });
  }
}

export function adminOnly(req: Request, res: Response, next: NextFunction): void {
  if (!isAdmin(req.user?.role)) {
    res.status(403).json({ code: -1, msg: 'Admin access required' });
    return;
  }
  next();
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}
