import { Request, Response, NextFunction } from 'express';

/**
 * Request logging middleware
 * Logs all incoming requests with method, path, status, and duration
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const originalSend = res.send;

  // Override send to capture response
  res.send = function (data: unknown) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Log request details
    const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const logData = {
      method: req.method,
      path: req.path,
      status: statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      timestamp: new Date().toISOString(),
    };

    if (logLevel === 'error') {
      console.error('[HTTP]', logData);
    } else if (logLevel === 'warn') {
      console.warn('[HTTP]', logData);
    } else {
      console.log('[HTTP]', logData);
    }

    // Call original send
    return originalSend.call(this, data);
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
