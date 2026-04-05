import { Response } from 'express';

/**
 * Standard API response format
 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
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
  static success<T>(res: Response, data?: T, message = 'Success', statusCode = 200): Response {
    return res.status(statusCode).json({
      code: statusCode,
      message,
      data,
      timestamp: new Date().toISOString(),
    } as ApiResponse<T>);
  }

  /**
   * Send error response
   */
  static error(res: Response, message: string, statusCode = 400, data?: unknown): Response {
    return res.status(statusCode).json({
      code: statusCode,
      message,
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
    message = 'Success',
    statusCode = 200
  ): Response {
    return res.status(statusCode).json({
      code: statusCode,
      message,
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
  static created<T>(res: Response, data: T, message = 'Created'): Response {
    return this.success(res, data, message, 201);
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
  static badRequest(res: Response, message: string, data?: unknown): Response {
    return this.error(res, message, 400, data);
  }

  /**
   * Send unauthorized response (401)
   */
  static unauthorized(res: Response, message = 'Unauthorized'): Response {
    return this.error(res, message, 401);
  }

  /**
   * Send forbidden response (403)
   */
  static forbidden(res: Response, message = 'Forbidden'): Response {
    return this.error(res, message, 403);
  }

  /**
   * Send not found response (404)
   */
  static notFound(res: Response, message = 'Not found'): Response {
    return this.error(res, message, 404);
  }

  /**
   * Send conflict response (409)
   */
  static conflict(res: Response, message: string, data?: unknown): Response {
    return this.error(res, message, 409, data);
  }

  /**
   * Send unprocessable entity response (422)
   */
  static unprocessable(res: Response, message: string, data?: unknown): Response {
    return this.error(res, message, 422, data);
  }

  /**
   * Send too many requests response (429)
   */
  static tooManyRequests(res: Response, message = 'Too many requests'): Response {
    return this.error(res, message, 429);
  }

  /**
   * Send internal server error response (500)
   */
  static internalError(res: Response, message = 'Internal server error', data?: unknown): Response {
    return this.error(res, message, 500, data);
  }
}
