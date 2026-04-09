import { Request, Response, NextFunction } from 'express';
import { log } from '../lib/logger';

/**
 * Standard API error response format
 */
export interface ApiError {
  code: number;
  message: string;
  details?: Record<string, unknown>;
  timestamp?: string;
}

/**
 * Custom error class for API errors
 */
export class AppError extends Error {
  constructor(
    public code: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Global error handler middleware
 * Catches all errors and returns standardized error responses
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  log.error('Error', 'Request error', {
    name: err.name,
    message: err.message,
    path: req.path,
    method: req.method,
  });

  if (err instanceof AppError) {
    res.status(err.code).json({
      code: err.code,
      message: err.message,
      details: err.details,
      timestamp: new Date().toISOString(),
    } as ApiError);
    return;
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    res.status(400).json({
      code: 400,
      message: 'Validation failed',
      details: { error: err.message },
      timestamp: new Date().toISOString(),
    } as ApiError);
    return;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      code: 401,
      message: 'Invalid token',
      timestamp: new Date().toISOString(),
    } as ApiError);
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      code: 401,
      message: 'Token expired',
      timestamp: new Date().toISOString(),
    } as ApiError);
    return;
  }

  // Default error response
  res.status(500).json({
    code: 500,
    message: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? { error: err.message } : undefined,
    timestamp: new Date().toISOString(),
  } as ApiError);
}

/**
 * Async route wrapper to catch errors
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Common error factory functions
 */
export const errors = {
  badRequest: (message: string, details?: Record<string, unknown>) =>
    new AppError(400, message, details),

  unauthorized: (message = 'Unauthorized') =>
    new AppError(401, message),

  forbidden: (message = 'Forbidden') =>
    new AppError(403, message),

  notFound: (resource: string) =>
    new AppError(404, `${resource} not found`),

  conflict: (message: string, details?: Record<string, unknown>) =>
    new AppError(409, message, details),

  unprocessable: (message: string, details?: Record<string, unknown>) =>
    new AppError(422, message, details),

  tooManyRequests: (message = 'Too many requests') =>
    new AppError(429, message),

  internalError: (message = 'Internal server error', details?: Record<string, unknown>) =>
    new AppError(500, message, details),
};
