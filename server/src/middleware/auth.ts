import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JwtPayload } from '../types';
import { isAdmin, normalizeRole } from '../utils/roles';
import { SecretOperations } from '../db/business-adapter';
import { verifyToken, hasServicePermission, hasDomainPermission } from '../service/token';
import { TokenPayload } from '../types/token';
import { log } from '../lib/logger';

// JWT密钥配置 - 如果没有设置则随机生成
const BASE_JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  
  // 如果设置了环境变量，使用环境变量
  if (secret) {
    // 生产环境检查密钥强度
    if (process.env.NODE_ENV === 'production' && secret.length < 32) {
      log.error('Auth', 'JWT_SECRET must be at least 32 characters long in production!');
      process.exit(1);
    }
    return secret;
  }
  
  // 如果没有设置，生成随机密钥（每次重启服务会变化，仅适合开发环境）
    const generatedSecret = crypto.randomBytes(32).toString('hex');
    log.warn('Auth', 'JWT_SECRET not set, using randomly generated secret.');
    log.warn('Auth', 'For production, please set JWT_SECRET environment variable to ensure token persistence across restarts.');
    return generatedSecret;
})();

const RUNTIME_SECRET_KEY = 'jwt_runtime';
let runtimeSecretCache: string | null = null;

async function getRuntimeSecret(): Promise<string> {
  if (runtimeSecretCache) return runtimeSecretCache;
  
  try {
    // 使用业务适配器获取运行时密钥
    const value = await SecretOperations.getRuntimeSecret(RUNTIME_SECRET_KEY);
    if (value) {
      runtimeSecretCache = value;
      return value;
    }
  } catch {
    // Table might not exist, will create below
  }
  
  // Fallback in case initSchema has not rotated secrets yet.
  const generated = crypto.randomBytes(32).toString('hex');
  
  try {
    // 使用业务适配器创建表和插入密钥
    await SecretOperations.ensureRuntimeSecretsTable();
    await SecretOperations.setRuntimeSecret(RUNTIME_SECRET_KEY, generated);
  } catch (e) {
    log.error('Auth', 'Error creating runtime_secrets table', { error: e });
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

/**
 * 检查是否使用令牌授权（而非 JWT/Session）
 * 用于限制令牌不能访问某些敏感路由
 */
function isTokenAuth(req: Request): boolean {
  return !!(req as any).tokenPayload;
}

/**
 * 禁止令牌授权访问的中间件
 * 用于保护敏感路由，如令牌管理、系统设置等
 * @param routeName 路由名称（用于错误提示）
 */
export function noTokenAuth(routeName: string = 'this resource') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (isTokenAuth(req)) {
      res.status(403).json({ 
        code: -1, 
        msg: `API token is not allowed to access ${routeName}. Please use JWT authentication.` 
      });
      return;
    }
    next();
  };
}

/**
 * 要求 JWT 认证（禁止使用令牌）的中间件
 * 组合了 authMiddleware 和 noTokenAuth 的功能
 * 用于超管权限路由
 */
export function requireJwtAuth(routeName: string = 'this resource') {
  return [
    authMiddleware,
    noTokenAuth(routeName)
  ];
}

/**
 * 检查 API 令牌是否有权限操作指定域名
 * 用于保护域名操作路由，防止令牌越权
 * @param paramName 域名ID参数名，默认为'id'，记录路由使用'domainId'
 */
export function requireTokenDomainPermission(paramName: string = 'id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const tokenPayload = (req as any).tokenPayload as TokenPayload | undefined;

    // 如果不是令牌认证，直接通过
    if (!tokenPayload) {
      next();
      return;
    }

    // 如果 allowed_domains 为空数组，表示允许所有域名
    if (!tokenPayload.allowedDomains || tokenPayload.allowedDomains.length === 0) {
      next();
      return;
    }

    // 获取请求中的域名 ID
    const domainId = req.params[paramName] ? parseInt(req.params[paramName], 10) : req.body.domain_id;

    if (!domainId || isNaN(domainId)) {
      res.status(403).json({
        code: -1,
        msg: 'Domain ID is required for API token access'
      });
      return;
    }

    // 检查域名是否在允许的列表中
    if (!tokenPayload.allowedDomains.includes(domainId)) {
      res.status(403).json({
        code: -1,
        msg: 'API token does not have permission to access this domain'
      });
      return;
    }

    next();
  };
}

export async function signToken(payload: JwtPayload): Promise<string> {
  const jwtSecret = await getJwtSecret();
  return jwt.sign(payload, jwtSecret, { expiresIn: '7d' });
}
