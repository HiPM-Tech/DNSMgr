import { api } from './client';
import type { ApiResponse } from './client';
import type { DnsAccount, Provider, Tunnel, TunnelConfig } from './types';

// ─── DNS Accounts API ─────────────────────────────────────────────────────────

export interface AccountListParams {
  purpose?: string;
  keyword?: string;
  type?: string;
  enabled?: 'enabled' | 'disabled' | 'all';
  page?: number;
  pageSize?: number;
}

export type AccountListResponse = DnsAccount[] | { list: DnsAccount[]; total: number; page: number; pageSize: number; totalPages: number };

export const accountsApi = {
  list: (params?: AccountListParams) => api.get<ApiResponse<AccountListResponse>>('/accounts', { params }),
  providers: () => api.get<ApiResponse<Provider[]>>('/accounts/providers'),
  get: (id: number) => api.get<ApiResponse<DnsAccount>>(`/accounts/${id}`),
  create: (data: { type: string; name: string; config: Record<string, string | boolean>; remark?: string; team_id?: number }) =>
    api.post<ApiResponse<{ id: number }>>('/accounts', data),
  update: (id: number, data: { name?: string; config?: Record<string, string | boolean>; remark?: string }) =>
    api.put<ApiResponse<null>>(`/accounts/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<null>>(`/accounts/${id}`),
  toggleEnabled: (id: number, enabled: boolean) =>
    api.patch<ApiResponse<{ enabled: boolean }>>(`/accounts/${id}/toggle-enabled`, { enabled }),
};

// ─── Tunnels API ──────────────────────────────────────────────────────────────

export const tunnelsApi = {
  list: () => api.get<ApiResponse<Tunnel[]>>('/tunnels'),
  getConfig: (accountId: string, tunnelId: string) => api.get<ApiResponse<TunnelConfig>>(`/tunnels/${accountId}/${tunnelId}`),
  updateConfig: (accountId: string, tunnelId: string, config: TunnelConfig) => api.put<ApiResponse<TunnelConfig>>(`/tunnels/${accountId}/${tunnelId}/config`, { config }),
  delete: (accountId: string, tunnelId: string) => api.delete<ApiResponse<null>>(`/tunnels/${accountId}/${tunnelId}`),
};
