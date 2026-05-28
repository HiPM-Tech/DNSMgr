import { api } from './client';
import type { ApiResponse } from './client';
import type { Domain, ProviderDomainOption, DnsLine, RenewalInfo, WhoisInfo } from './types';

// ─── Domains API ──────────────────────────────────────────────────────────────

export const domainsApi = {
  list: (params?: { 
    account_id?: number; 
    keyword?: string; 
    domain_type?: 'all' | 'apex' | 'subdomain'; 
    include_disabled?: string;
    page?: number; 
    pageSize?: number 
  }) =>
    api.get<ApiResponse<{ list: Domain[]; total: number; page: number; pageSize: number; totalPages: number }>>('/domains', { 
      params
    }),
  get: (id: number) => api.get<ApiResponse<Domain>>(`/domains/${id}`),
  listFromProvider: (accountId: number) =>
    api.get<ApiResponse<ProviderDomainOption[]>>(`/domains/provider-list/${accountId}`),
  create: (data:
    { name: string; account_id: number; third_id?: string; remark?: string } |
    { account_id: number; remark?: string; domains: ProviderDomainOption[] }) =>
    api.post<ApiResponse<{ id?: number; added?: number; skipped?: number; duplicates?: string[] }>>('/domains', data),
  update: (id: number, data: { remark?: string; enabled?: number }) =>
    api.put<ApiResponse<null>>(`/domains/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<null>>(`/domains/${id}`),
  lines: (id: number) => api.get<ApiResponse<DnsLine[]>>(`/domains/${id}/lines`),
  getFailover: (id: number) => api.get<ApiResponse<{ config: any, status: any } | null>>(`/domains/${id}/failover`),
  saveFailover: (id: number, data: any) => api.post<ApiResponse<any>>(`/domains/${id}/failover`, data),
  deleteFailover: (id: number) => api.delete<ApiResponse<any>>(`/domains/${id}/failover`),
};

// ─── Domain Renewal API ───────────────────────────────────────────────────────

export const domainRenewalApi = {
  renew: (domainId: number, subdomainId: number) =>
    api.post<ApiResponse<RenewalInfo>>(`/domains/${domainId}/renew`, { subdomain_id: subdomainId }),
  getWhois: (domain: string) =>
    api.get<ApiResponse<WhoisInfo>>(`/domains/whois`, { params: { domain } }),
  getRenewableDomains: () =>
    api.get<ApiResponse<any[]>>('/domains/renewable-domains'),
  addRenewableDomain: (data: {
    account_id: number;
    provider_type: string;
    domain_name: string;
    third_id: string;
    full_domain: string;
    expires_at?: string;
    remark?: string;
  }) =>
    api.post<ApiResponse<{ id: number }>>('/domains/renewable-domains', data),
  deleteRenewableDomain: (id: number) =>
    api.delete<ApiResponse<void>>(`/domains/renewable-domains/${id}`),
  toggleEnabled: (id: number, enabled: boolean) =>
    api.patch<ApiResponse<{ enabled: boolean }>>(`/domains/renewable-domains/${id}/toggle-enabled`, { enabled }),
};
