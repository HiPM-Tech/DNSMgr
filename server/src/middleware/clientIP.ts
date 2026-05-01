import { Request, Response, NextFunction } from 'express';

/**
 * 检查 IP 是否为内网地址
 * 包括：127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, ::1
 */
function isPrivateIP(ip: string): boolean {
  // 移除 IPv6 前缀
  const normalizedIP = ip.replace(/^::ffff:/, '');
  
  // IPv6 localhost
  if (normalizedIP === '::1' || normalizedIP === 'localhost') {
    return true;
  }
  
  // IPv4 私有地址段
  const parts = normalizedIP.split('.').map(Number);
  if (parts.length !== 4) return false;
  
  const [a, b] = parts;
  
  // 127.0.0.0/8 (localhost)
  if (a === 127) return true;
  
  // 10.0.0.0/8
  if (a === 10) return true;
  
  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;
  
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  
  // 169.254.0.0/16 (链路本地地址)
  if (a === 169 && b === 254) return true;
  
  return false;
}

/**
 * 从请求中提取真实的客户端 IP
 * 支持 Nginx 等反向代理场景
 * 
 * 策略：
 * 1. 如果请求来自内网 IP（可能是反向代理），优先使用 X-Forwarded-For / X-Real-IP
 * 2. 如果没有这些头部，直接使用发起请求的客户端 IP
 */
export function getClientIP(req: Request): string {
  const remoteAddr = req.socket.remoteAddress;
  
  // 1. 检查是否来自内网（可能是反向代理）
  if (remoteAddr && isPrivateIP(remoteAddr)) {
    // 优先从 X-Forwarded-For 头部获取（取第一个非空 IP）
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor) 
        ? forwardedFor 
        : forwardedFor.split(',').map(ip => ip.trim()).filter(ip => ip);
      
      if (ips.length > 0) {
        return ips[0];
      }
    }

    // 从 X-Real-IP 头部获取
    const realIP = req.headers['x-real-ip'];
    if (realIP) {
      const ip = Array.isArray(realIP) ? realIP[0] : realIP;
      if (ip) return ip;
    }
  }

  // 2. 没有反向代理头部或非内网请求，直接使用客户端 IP
  // Express 的 req.ip 已经处理了 trust proxy 配置
  if (req.ip) {
    return req.ip;
  }

  // 3. 最后使用 socket remoteAddress
  return remoteAddr || 'unknown';
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
