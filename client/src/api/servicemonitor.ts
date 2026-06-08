import { api } from './client';
import type { ApiResponse } from './client';

export const serviceMonitorApi = {
  list: (params?: { page?: number; pageSize?: number; type?: string }) =>
    api.get<ApiResponse<{ list: any[]; total: number; page: number; pageSize: number }>>('/servicemonitor', { params }),
  get: (id: number) => api.get<ApiResponse<any>>(`/servicemonitor/${id}`),
  create: (data: any) => api.post<ApiResponse<any>>('/servicemonitor', data),
  update: (id: number, data: any) => api.put<ApiResponse<any>>(`/servicemonitor/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<any>>(`/servicemonitor/${id}`),
  check: (id: number) => api.post<ApiResponse<any>>(`/servicemonitor/${id}/check`, undefined, { timeout: 60000 }),
  getAvailableDomains: () => api.get<ApiResponse<any[]>>('/servicemonitor/available-domains'),
  getChildren: (parentId: number) => api.get<ApiResponse<any[]>>(`/servicemonitor/children/${parentId}`),
  getStats: () => api.get<ApiResponse<any>>('/servicemonitor/stats'),
};