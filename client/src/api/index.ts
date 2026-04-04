import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  code: number;
  data: T;
  msg: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'member';
  status: number;
  created_at: string;
  updated_at?: string;
}

export interface Provider {
  type: string;
  name: string;
  configFields: ProviderField[];
  features?: string[];
}

export interface ProviderField {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
}

export interface DnsAccount {
  id: number;
  type: string;
  name: string;
  config: Record<string, string>;
  remark: string;
  created_by: number;
  team_id?: number;
  created_at: string;
}

export interface Domain {
  id: number;
  name: string;
  account_id: number;
  third_id?: string;
  remark: string;
  record_count?: number;
  created_at: string;
}

export interface ProviderDomainOption {
  name: string;
  third_id: string;
  record_count?: number;
}

export interface DnsRecord {
  id: string;
  name: string;
  type: string;
  value: string;
  line?: string;
  cloudflare?: {
    proxied?: boolean;
    proxiable?: boolean;
  } | null;
  ttl?: number;
  mx?: number;
  weight?: number;
  status: number;
  proxiable?: boolean | null;
  remark?: string | null;
  updated_at?: string | null;
}

export interface DnsLine {
  id: string;
  name: string;
}

export interface Team {
  id: number;
  name: string;
  description: string;
  created_by: number;
  created_at: string;
  member_count?: number;
  my_role?: string;
}

export interface TeamMember {
  id: number;
  team_id: number;
  user_id: number;
  role: string;
  username: string;
  email: string;
}

export interface LogEntry {
  id: number;
  user_id?: number;
  username?: string;
  action: string;
  domain?: string;
  data?: string;
  target?: string;
  detail?: string;
  created_at: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (username: string, password: string) =>
    api.post<ApiResponse<{ token: string; user: User }>>('/auth/login', { username, password }),
  me: () => api.get<ApiResponse<User>>('/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.put<ApiResponse<null>>('/auth/password', { oldPassword, newPassword }),
};

// ─── Accounts ─────────────────────────────────────────────────────────────────

export const accountsApi = {
  list: () => api.get<ApiResponse<DnsAccount[]>>('/accounts'),
  providers: () => api.get<ApiResponse<Provider[]>>('/accounts/providers'),
  get: (id: number) => api.get<ApiResponse<DnsAccount>>(`/accounts/${id}`),
  create: (data: { type: string; name: string; config: Record<string, string>; remark?: string; team_id?: number }) =>
    api.post<ApiResponse<{ id: number }>>('/accounts', data),
  update: (id: number, data: { name?: string; config?: Record<string, string>; remark?: string }) =>
    api.put<ApiResponse<null>>(`/accounts/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<null>>(`/accounts/${id}`),
};

// ─── Domains ──────────────────────────────────────────────────────────────────

export const domainsApi = {
  list: (params?: { account_id?: number; keyword?: string }) =>
    api.get<ApiResponse<Domain[]>>('/domains', { params }),
  get: (id: number) => api.get<ApiResponse<Domain>>(`/domains/${id}`),
  listFromProvider: (accountId: number) =>
    api.get<ApiResponse<ProviderDomainOption[]>>(`/domains/provider-list/${accountId}`),
  create: (data:
    { name: string; account_id: number; third_id?: string; remark?: string } |
    { account_id: number; remark?: string; domains: ProviderDomainOption[] }) =>
    api.post<ApiResponse<{ id?: number; added?: number; skipped?: number; duplicates?: string[] }>>('/domains', data),
  update: (id: number, data: { remark?: string }) =>
    api.put<ApiResponse<null>>(`/domains/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<null>>(`/domains/${id}`),
  lines: (id: number) => api.get<ApiResponse<DnsLine[]>>(`/domains/${id}/lines`),
};

// ─── Records ──────────────────────────────────────────────────────────────────

export const recordsApi = {
  list: (domainId: number, params?: { type?: string; keyword?: string }) =>
    api.get<ApiResponse<{ total: number; list: DnsRecord[] }>>(`/domains/${domainId}/records`, { params }),
  create: (domainId: number, data: Partial<DnsRecord>) =>
    api.post<ApiResponse<{ id: number }>>(`/domains/${domainId}/records`, data),
  update: (domainId: number, recordId: string, data: Partial<DnsRecord>) =>
    api.put<ApiResponse<null>>(`/domains/${domainId}/records/${recordId}`, data),
  delete: (domainId: number, recordId: string) =>
    api.delete<ApiResponse<null>>(`/domains/${domainId}/records/${recordId}`),
  setStatus: (domainId: number, recordId: string, status: number) =>
    api.put<ApiResponse<null>>(`/domains/${domainId}/records/${recordId}/status`, { status }),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  list: () => api.get<ApiResponse<User[]>>('/users'),
  create: (data: { username: string; email?: string; password: string; role?: string }) =>
    api.post<ApiResponse<{ id: number }>>('/users', data),
  update: (id: number, data: { email?: string; role?: string; status?: number; password?: string }) =>
    api.put<ApiResponse<null>>(`/users/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<null>>(`/users/${id}`),
};

// ─── Teams ────────────────────────────────────────────────────────────────────

export const teamsApi = {
  list: () => api.get<ApiResponse<Team[]>>('/teams'),
  get: (id: number) => api.get<ApiResponse<Team>>(`/teams/${id}`),
  create: (data: { name: string; description?: string }) =>
    api.post<ApiResponse<{ id: number }>>('/teams', data),
  update: (id: number, data: { name?: string; description?: string }) =>
    api.put<ApiResponse<null>>(`/teams/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<null>>(`/teams/${id}`),
  members: (id: number) => api.get<ApiResponse<TeamMember[]>>(`/teams/${id}/members`),
  addMember: (id: number, userId: number, role?: string) =>
    api.post<ApiResponse<null>>(`/teams/${id}/members`, { userId, role }),
  removeMember: (id: number, userId: number) =>
    api.delete<ApiResponse<null>>(`/teams/${id}/members/${userId}`),
};

// ─── Logs ─────────────────────────────────────────────────────────────────────

export const logsApi = {
  list: (params?: { pageSize?: number; page?: number; domain?: string; userId?: number }) =>
    api.get<ApiResponse<{ total: number; list: LogEntry[] }>>('/logs', { params }),
};
