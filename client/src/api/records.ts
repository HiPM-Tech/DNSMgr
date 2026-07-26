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

export interface EmailTemplateRecord {
  name: string;
  type: 'A' | 'AAAA' | 'MX' | 'TXT' | 'CNAME' | 'SPF' | 'DKIM' | 'DMARC';
  value: string;
  priority?: number;
  ttl?: number;
  remark?: string;
}

export interface EmailTemplate {
  name: string;
  provider: string;
  description: string;
  records: EmailTemplateRecord[];
  documentation?: string;
  notes?: string[];
}

export const recordsApi = {
  list: (domainId: number, params?: RecordListParams) =>
    api.get<ApiResponse<{ total: number; list: DnsRecord[] }>>(`/domains/${domainId}/records`, { params }),
  exportZone: (domainId: number) =>
    api.get<ApiResponse<{ content: string; filename: string }>>(`/domains/${domainId}/records/export/zone`),
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
  // Email template APIs
  getEmailTemplates: () =>
    api.get<ApiResponse<{ templates: Array<{ id: string; name: string; provider: string }> }>>('/domains/email-templates'),
  getEmailTemplate: (templateId: string) =>
    api.get<ApiResponse<{ template: EmailTemplate }>>(`/domains/email-templates/${templateId}`),
  getEmailTemplatePreview: (templateId: string, domain: string) =>
    api.get<ApiResponse<{ preview: string }>>(`/domains/email-templates/${templateId}/preview`, { params: { domain } }),
};
