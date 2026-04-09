import { Response } from 'express';
import { log } from '../lib/logger';

/**
 * Standard API response format
 * Note: Using 'msg' instead of 'message' for consistency with existing codebase
 */
export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data?: T;
  timestamp?: string;
}

/**
 * Response helper class for consistent API responses
 */
export class ResponseHelper {
  /**
   * Send success response
   */
  static success<T>(res: Response, data?: T, msg = 'Success', statusCode = 200): Response {
    return res.status(statusCode).json({
      code: 0, // Success code is 0
      msg,
      data,
      timestamp: new Date().toISOString(),
    } as ApiResponse<T>);
  }

  /**
   * Send error response
   */
  static error(res: Response, msg: string, statusCode = 400, data?: unknown): Response {
    return res.status(statusCode).json({
      code: statusCode,
      msg,
      data,
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }

  /**
   * Send paginated response
   */
  static paginated<T>(
    res: Response,
    items: T[],
    total: number,
    page: number,
    pageSize: number,
    msg = 'Success',
    statusCode = 200
  ): Response {
    return res.status(statusCode).json({
      code: 0,
      msg,
      data: {
        items,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }

  /**
   * Send created response (201)
   */
  static created<T>(res: Response, data: T, msg = 'Created'): Response {
    return this.success(res, data, msg, 201);
  }

  /**
   * Send no content response (204)
   */
  static noContent(res: Response): Response {
    return res.status(204).send();
  }

  /**
   * Send bad request response (400)
   */
  static badRequest(res: Response, msg: string, data?: unknown): Response {
    return this.error(res, msg, 400, data);
  }

  /**
   * Send unauthorized response (401)
   */
  static unauthorized(res: Response, msg = 'Unauthorized'): Response {
    return this.error(res, msg, 401);
  }

  /**
   * Send forbidden response (403)
   */
  static forbidden(res: Response, msg = 'Forbidden'): Response {
    return this.error(res, msg, 403);
  }

  /**
   * Send not found response (404)
   */
  static notFound(res: Response, msg = 'Not found'): Response {
    return this.error(res, msg, 404);
  }

  /**
   * Send conflict response (409)
   */
  static conflict(res: Response, msg: string, data?: unknown): Response {
    return this.error(res, msg, 409, data);
  }

  /**
   * Send unprocessable entity response (422)
   */
  static unprocessable(res: Response, msg: string, data?: unknown): Response {
    return this.error(res, msg, 422, data);
  }

  /**
   * Send too many requests response (429)
   */
  static tooManyRequests(res: Response, msg = 'Too many requests'): Response {
    return this.error(res, msg, 429);
  }

  /**
   * Send internal server error response (500)
   */
  static internalError(res: Response, msg = 'Internal server error', data?: unknown): Response {
    return this.error(res, msg, 500, data);
  }
}

/**
 * Async handler wrapper for Express routes
 * Automatically catches errors and passes them to next()
 */
export const asyncHandler = (fn: Function) => (req: any, res: any, next: any) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Global error handler middleware
 */
export function globalErrorHandler(err: Error, req: any, res: Response, _next: any): void {
  log.error('Error', 'Unhandled error', { error: err });
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    ResponseHelper.badRequest(res, err.message);
    return;
  }
  
  if (err.name === 'UnauthorizedError') {
    ResponseHelper.unauthorized(res, 'Unauthorized');
    return;
  }
  
  if (err.name === 'ForbiddenError') {
    ResponseHelper.forbidden(res, 'Forbidden');
    return;
  }
  
  // Default to internal server error
  ResponseHelper.internalError(res, process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message);
}
