import { api } from './client';
import type { ApiResponse } from './client';

export const serviceMonitorApi = {
  list: () => api.get<ApiResponse<any[]>>('/servicemonitor'),
  get: (id: number) => api.get<ApiResponse<any>>(`/servicemonitor/${id}`),
  create: (data: any) => api.post<ApiResponse<any>>('/servicemonitor', data),
  update: (id: number, data: any) => api.put<ApiResponse<any>>(`/servicemonitor/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<any>>(`/servicemonitor/${id}`),
  check: (id: number) => api.post<ApiResponse<any>>(`/servicemonitor/${id}/check`),
  getAvailableDomains: () => api.get<ApiResponse<any[]>>('/servicemonitor/available-domains'),
  getStats: () => api.get<ApiResponse<any>>('/servicemonitor/stats'),
};