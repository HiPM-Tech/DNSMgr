import { api, ApiResponse } from './client';
import type { LogEntry } from './types';

// ─── Logs API ─────────────────────────────────────────────────────────────────

export const logsApi = {
  list: (params?: { pageSize?: number; page?: number; domain?: string; userId?: number; action?: string; startDate?: string; endDate?: string }) =>
    api.get<ApiResponse<{ total: number; list: LogEntry[] }>>('/logs', { params }),
};
