import { api, ApiResponse } from './client';
import type { UserToken } from './types';

// ─── Tokens API ───────────────────────────────────────────────────────────────

export const tokensApi = {
  getAll: () => api.get<ApiResponse<UserToken[]>>('/tokens'),
  create: (data: {
    name: string;
    allowed_domains: number[];
    start_time?: string;
    end_time?: string;
  }) => api.post<ApiResponse<{ token: string; tokenData: UserToken }>>('/tokens', data),
  update: (id: number, data: {
    name?: string;
    allowed_domains?: number[];
    start_time?: string;
    end_time?: string;
  }) => api.put<ApiResponse<null>>(`/tokens/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<null>>(`/tokens/${id}`),
  toggleStatus: (id: number, is_active: boolean) =>
    api.patch<ApiResponse<null>>(`/tokens/${id}/status`, { is_active }),
  getDomains: () => api.get<ApiResponse<{ id: number; name: string; account_name: string }[]>>('/tokens/domains'),
};
