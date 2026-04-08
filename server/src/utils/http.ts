import { Request, Response } from 'express';
import { ApiResponse } from '../types';

type IntegerOptions = {
  defaultValue?: number;
  min?: number;
  max?: number;
};

function getFirstValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

export function getString(value: unknown): string | undefined {
  const normalized = getFirstValue(value);
  if (typeof normalized !== 'string') {
    return undefined;
  }

  const trimmed = normalized.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseInteger(value: unknown, options: IntegerOptions = {}): number | undefined {
  const normalized = getFirstValue(value);

  if (normalized === undefined || normalized === null || normalized === '') {
    return options.defaultValue;
  }

  const parsed = typeof normalized === 'number'
    ? normalized
    : Number.parseInt(String(normalized), 10);

  if (!Number.isInteger(parsed)) {
    return options.defaultValue;
  }

  let result = parsed;

  if (options.min !== undefined) {
    result = Math.max(options.min, result);
  }

  if (options.max !== undefined) {
    result = Math.min(options.max, result);
  }

  return result;
}

export function parsePagination(
  query: Request['query'],
  options: { defaultPage?: number; defaultPageSize?: number; maxPageSize?: number } = {}
): { page: number; pageSize: number } {
  const page = parseInteger(query.page, {
    defaultValue: options.defaultPage ?? 1,
    min: 1,
  }) ?? 1;
  const pageSize = parseInteger(query.pageSize, {
    defaultValue: options.defaultPageSize ?? 50,
    min: 1,
    max: options.maxPageSize ?? 200,
  }) ?? (options.defaultPageSize ?? 50);

  return { page, pageSize };
}

export function sendSuccess<T>(res: Response, data?: T, msg = 'success', statusCode = 200): Response {
  return res.status(statusCode).json({
    code: 0,
    data,
    msg,
  } as ApiResponse<T>);
}

export function sendError(res: Response, msg: string, statusCode = 200, data?: unknown): Response {
  return res.status(statusCode).json({
    code: statusCode >= 400 ? statusCode : -1,
    data,
    msg,
  } as ApiResponse);
}

export function sendServerError(res: Response, msg = 'Database error'): Response {
  return sendError(res, msg, 500);
}
