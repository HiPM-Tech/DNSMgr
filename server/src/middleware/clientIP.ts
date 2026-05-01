import { Request, Response, NextFunction } from 'express';
import { log } from '../lib/logger';

/**
 * 信任的代理 IP 列表
 * 只有来自这些 IP 的请求才会使用 X-Forwarded-For 等头部
 */
const TRUSTED_PROXIES = new Set([
  '127.0.0.1',
  '::1',
  ...(process.env.TRUSTED_PROXIES ? process.env.TRUSTED_PROXIES.split(',').map(ip => ip.trim()) : [])
]);

/**
 * 从请求中提取真实的客户端 IP
 * 支持 Nginx 等反向代理场景
 */
export function getClientIP(req: Request): string {
  // 1. 优先从 X-Forwarded-For 头部获取（可能有多个 IP，取第一个）
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) 
      ? forwardedFor 
      : forwardedFor.split(',').map(ip => ip.trim());
    
    // 如果请求来自信任的代理，使用第一个 IP（客户端真实 IP）
    const clientIp = ips[0];
    if (clientIp && isTrustedProxy(req)) {
      return clientIp;
    }
  }

  // 2. 从 X-Real-IP 头部获取
  const realIP = req.headers['x-real-ip'];
  if (realIP && isTrustedProxy(req)) {
    return Array.isArray(realIP) ? realIP[0] : realIP;
  }

  // 3. 降级到 Express 的 req.ip（已经处理了 trust proxy）
  if (req.ip) {
    return req.ip;
  }

  // 4. 最后使用 socket remoteAddress
  return req.socket.remoteAddress || 'unknown';
}

/**
 * 检查请求是否来自信任的代理
 */
function isTrustedProxy(req: Request): boolean {
  const remoteAddr = req.socket.remoteAddress;
  if (!remoteAddr) return false;
  
  // 移除 IPv6 前缀 ::ffff:
  const normalizedAddr = remoteAddr.replace(/^::ffff:/, '');
  return TRUSTED_PROXIES.has(normalizedAddr) || TRUSTED_PROXIES.has(remoteAddr);
}

/**
 * Express 中间件：为每个请求附加真实客户端 IP
 */
export function clientIPMiddleware(req: Request, res: Response, next: NextFunction): void {
  const clientIP = getClientIP(req);
  
  // 将真实 IP 附加到 request 对象上
  (req as any).clientIP = clientIP;
  
  // 同时设置 req.ip，这样 Express 的其他中间件也能使用
  if (!req.ip || req.ip === '127.0.0.1' || req.ip === '::1') {
    (req as any).ip = clientIP;
  }
  
  next();
}

/**
 * 获取请求的客户端 IP（便捷函数）
 */
export function getRequestIP(req: Request): string {
  return (req as any).clientIP || getClientIP(req);
}
