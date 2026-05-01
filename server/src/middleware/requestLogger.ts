import { Request, Response, NextFunction } from 'express';
import { log } from '../lib/logger';
import { getRequestIP } from './clientIP';

/**
 * Request logging middleware
 * Logs all incoming requests with method, path, status, and duration
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const originalSend = res.send;
  const originalJson = res.json;

  // Helper function to perform logging
  const doLog = () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // 扁平化日志：只保留关键信息
    const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'debug';
    
    // 基础日志数据（精简）
    const baseLog = `${req.method} ${req.path} ${statusCode} ${duration}ms`;
    
    // 错误和警告才记录详细信息
    if (logLevel === 'error') {
      log.error('HTTP', baseLog, { 
        ip: getRequestIP(req),
        error: 'Server error'
      });
    } else if (logLevel === 'warn') {
      // 404 等警告只记录基础信息
      if (statusCode === 404) {
        log.debug('HTTP', baseLog);
      } else {
        log.warn('HTTP', baseLog, { ip: getRequestIP(req) });
      }
    } else {
      // 正常请求使用 debug 级别
      log.debug('HTTP', baseLog);
    }
  };

  // Override send to capture response
  res.send = function (data: unknown) {
    doLog();
    return originalSend.call(this, data);
  };

  // Override json to capture response
  res.json = function (data: unknown) {
    doLog();
    return originalJson.call(this, data);
  };

  next();
}

/**
 * Request ID middleware
 * Adds a unique request ID for tracing
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.get('x-request-id') || generateRequestId();
  req.id = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Extend Express Request type to include request ID
 */
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}
