import { Request, Response, NextFunction } from 'express';
import { log } from '../lib/logger';

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

    // Log request details
    const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const logData: Record<string, unknown> = {
      method: req.method,
      path: req.path,
      status: statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    // Add user info if available (from auth middleware)
    if ((req as any).user) {
      logData.userId = (req as any).user.id;
      logData.username = (req as any).user.username;
    }

    // Add query params for GET requests
    if (req.method === 'GET' && Object.keys(req.query).length > 0) {
      logData.query = req.query;
    }

    // Add body for non-GET requests (excluding sensitive endpoints)
    const sensitivePaths = ['/api/auth/login', '/api/auth/register', '/api/init/admin'];
    const isSensitive = sensitivePaths.some(path => req.path.includes(path));
    if (req.method !== 'GET' && !isSensitive && req.body && Object.keys(req.body).length > 0) {
      // Filter out sensitive fields
      const filteredBody = { ...req.body };
      delete filteredBody.password;
      delete filteredBody.password_hash;
      delete filteredBody.token;
      if (Object.keys(filteredBody).length > 0) {
        logData.body = filteredBody;
      }
    }

    if (logLevel === 'error') {
      log.error('HTTP', 'Request error', logData);
    } else if (logLevel === 'warn') {
      log.warn('HTTP', 'Request warning', logData);
    } else {
      log.info('HTTP', 'Request completed', logData);
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
