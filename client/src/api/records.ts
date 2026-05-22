import { api } from './client';
import type { ApiResponse } from './client';
import type { DnsRecord } from './types';

// ─── DNS Records API ──────────────────────────────────────────────────────────

export interface RecordListParams {
  type?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export const recordsApi = {
  list: (domainId: number, params?: RecordListParams) =>
    api.get<ApiResponse<{ total: number; list: DnsRecord[] }>>(`/domains/${domainId}/records`, { params }),
  create: (domainId: number, data: Partial<DnsRecord>) =>
    api.post<ApiResponse<{ id: string }>>(`/domains/${domainId}/records`, data),
  createBatch: (domainId: number, records: Partial<DnsRecord>[]) =>
    api.post<ApiResponse<{ addedIds: string[] }>>(`/domains/${domainId}/records/batch`, { records }),
  update: (domainId: number, recordId: string, data: Partial<DnsRecord>) =>
    api.put<ApiResponse<null>>(`/domains/${domainId}/records/${recordId}`, data),
  delete: (domainId: number, recordId: string) =>
    api.delete<ApiResponse<null>>(`/domains/${domainId}/records/${recordId}`),
  setStatus: (domainId: number, recordId: string, status: number) =>
    api.put<ApiResponse<null>>(`/domains/${domainId}/records/${recordId}/status`, { status }),
};
