import { api } from './client';
import type { ApiResponse } from './client';
import type { NSMonitorConfig } from './types';

// ─── NS Monitor API ───────────────────────────────────────────────────────────

export const nsMonitorApi = {
  list: (params?: { page?: number; pageSize?: number }) =>
    api.get<ApiResponse<{ list: NSMonitorConfig[]; total: number; page: number; pageSize: number }>>('/ns-monitor', { params }),
  get: (id: number) => api.get<ApiResponse<NSMonitorConfig & { alerts: any[] }>>(`/ns-monitor/${id}`),
  getByDomain: (domainId: number) => api.get<ApiResponse<NSMonitorConfig | null>>(`/ns-monitor/domain/${domainId}`),
  getAvailableDomains: () => api.get<ApiResponse<Array<{ id: number; name: string; account_id: number }>>>('/ns-monitor/available-domains'),
  create: (data: { domain_name: string; expected_ns: string; enabled: boolean; notify_email: boolean; notify_channels: boolean }) =>
    api.post<ApiResponse<{ id: number }>>('/ns-monitor', data),
  update: (id: number, data: { expected_ns?: string; enabled?: boolean }) =>
    api.put<ApiResponse<null>>(`/ns-monitor/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<null>>(`/ns-monitor/${id}`),
  getUserPrefs: () => api.get<ApiResponse<{ notify_email: boolean; notify_channels: boolean; check_interval: number }>>('/ns-monitor/user/prefs'),
  updateUserPrefs: (data: { notify_email?: boolean; notify_channels?: boolean; check_interval?: number }) =>
    api.put<ApiResponse<null>>('/ns-monitor/user/prefs', data),
  check: (domainName: string) => api.post<ApiResponse<{ current_ns: string[]; expected_ns: string[]; status: string }>>('/ns-monitor/check', { domain_name: domainName }),
  resolveNs: (domain: string) => api.post<ApiResponse<{
    domain: string;
    nsRecords: string[];
    encryptedNs: string[];
    plainNs: string[];
    isPoisoned: boolean;
    recommendedNs: string[];
  }>>('/ns-monitor/resolve-ns', { domain }),
};
