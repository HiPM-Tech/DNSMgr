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
  nickname: string;
  email: string;
  role: 1 | 2 | 3;
  status: number;
  created_at: string;
  updated_at?: string;
}

export interface Provider {
  type: string;
  name: string;
  configFields: ProviderField[];
  capabilities?: {
    remark: boolean;
    status: boolean;
    redirect: boolean;
    log: boolean;
    weight: boolean;
    line: boolean;
    cnameFlattening: boolean;
  };
  features?: string[];
  isStub?: boolean;
}

export interface ProviderFieldOption {
  value: string;
  label: string;
}

export interface ProviderField {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: ProviderFieldOption[];
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
  expires_at?: string;
  created_at: string;
}

export interface DomainPermission {
  id: number;
  user_id?: number | null;
  team_id?: number | null;
  domain_id: number;
  sub: string;
  permission: 'read' | 'write';
  domain_name?: string;
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
  nickname: string;
  email: string;
}

export interface LogEntry {
  id: number;
  user_id?: number;
  username?: string;
  nickname?: string;
  action: string;
  domain?: string;
  data?: string;
  target?: string;
  detail?: string;
  created_at: string;
}

export interface WebAuthnResponse {
  id: string;
  rawId: string;
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle?: string;
  };
  type: 'public-key';
  clientExtensionResults?: unknown;
}

export interface WebAuthnCredential {
  id: string;
  name: string;
  created_at: string;
  last_used_at?: string;
}

export interface FailoverConfig {
  id: number;
  domain_id: number;
  record_id: number;
  record_type: string;
  record_name: string;
  primary_value: string;
  backup_value: string;
  check_interval: number;
  check_timeout: number;
  check_method: string;
  enabled: boolean;
}

export interface FailoverStatus {
  id: number;
  config_id: number;
  current_value: string;
  status: 'primary' | 'backup' | 'unknown';
  last_check_at?: string;
  last_failover_at?: string;
  fail_count: number;
  success_count: number;
  last_error?: string;
}

export interface FailoverData {
  config: FailoverConfig;
  status: FailoverStatus;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (username: string, password: string, totpCode?: string, backupCode?: string, webauthnResponse?: WebAuthnResponse) =>
    api.post<ApiResponse<{ token?: string; user?: User; types?: string[] }>>('/auth/login', { username, password, totpCode, backupCode, webauthnResponse }),
  webauthnRegOptions: () => api.get<ApiResponse<{ options: unknown }>>('/auth/webauthn/registration-options'),
  webauthnRegVerify: (data: { credential: unknown }) => api.post<ApiResponse<{ success: boolean }>>('/auth/webauthn/registration-verify', data),
  webauthnLoginOptions: (username: string) => api.get<ApiResponse<{ options: unknown }>>(`/auth/webauthn/login-options?username=${encodeURIComponent(username)}`),
  webauthnCreds: () => api.get<ApiResponse<WebAuthnCredential[]>>('/auth/webauthn/credentials'),
  webauthnDeleteCred: (id: string) => api.delete<ApiResponse<null>>(`/auth/webauthn/credentials/${encodeURIComponent(id)}`),
  oauthStatus: () => api.get<ApiResponse<OAuthStatus>>('/auth/oauth/status'),
  oauthStart: (provider?: 'custom' | 'logto') => api.post<ApiResponse<{ authUrl: string }>>('/auth/oauth/start', { provider }),
  oauthStartBind: (provider?: 'custom' | 'logto') => api.post<ApiResponse<{ authUrl: string }>>('/auth/oauth/start-bind', { provider }),
  oauthCallback: (code: string, state: string) =>
    api.post<ApiResponse<{ token?: string; user?: User; mode?: 'login' | 'bind' }>>('/auth/oauth/callback', { code, state }),
  oauthBindings: () => api.get<ApiResponse<OAuthBinding[]>>('/auth/oauth/bindings'),
  unbindOAuth: (provider: string) => api.delete<ApiResponse<null>>(`/auth/oauth/bindings/${encodeURIComponent(provider)}`),
  me: () => api.get<ApiResponse<User>>('/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.put<ApiResponse<null>>('/auth/password', { oldPassword, newPassword }),
  updateProfile: (data: { nickname?: string; email?: string; emailCode?: string }) =>
    api.put<ApiResponse<User>>('/auth/profile', data),
  sendEmailVerificationCode: (email: string) =>
    api.post<ApiResponse<null>>('/auth/profile/email-code', { email }),
  requestPasswordReset: (email: string) =>
    api.post<ApiResponse<null>>('/auth/password-reset/request', { email }),
  confirmPasswordReset: (email: string, code: string, newPassword: string) =>
    api.post<ApiResponse<null>>('/auth/password-reset/confirm', { email, code, newPassword }),
  getFailover: (id: number) => api.get<ApiResponse<FailoverData>>(`/domains/${id}/failover`),
  createFailover: (id: number, data: Partial<FailoverConfig>) => api.post<ApiResponse<FailoverConfig>>(`/domains/${id}/failover`, data),
  updateFailover: (id: number, data: Partial<FailoverConfig>) => api.put<ApiResponse<FailoverConfig>>(`/domains/${id}/failover`, data),
  deleteFailover: (id: number) => api.delete<ApiResponse<null>>(`/domains/${id}/failover`),
  getPreferences: () => api.get<ApiResponse<{ theme: string; language: string; notificationsEnabled: boolean; emailNotifications: boolean; backgroundImage?: string }>>('/auth/preferences'),
  updatePreferences: (data: { theme?: string; language?: string; notificationsEnabled?: boolean; emailNotifications?: boolean; backgroundImage?: string }) =>
    api.put<ApiResponse<null>>('/auth/preferences', data),
};

// ─── Accounts ─────────────────────────────────────────────────────────────────

export interface Tunnel {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

export interface TunnelConfig {
  [key: string]: unknown;
}

// ─── Tunnels ──────────────────────────────────────────────────────────────────
export const tunnelsApi = {
  list: () => api.get<ApiResponse<Tunnel[]>>('/tunnels'),
  getConfig: (accountId: string, tunnelId: string) => api.get<ApiResponse<TunnelConfig>>(`/tunnels/${accountId}/${tunnelId}`),
  updateConfig: (accountId: string, tunnelId: string, config: TunnelConfig) => api.put<ApiResponse<TunnelConfig>>(`/tunnels/${accountId}/${tunnelId}/config`, { config }),
  delete: (accountId: string, tunnelId: string) => api.delete<ApiResponse<null>>(`/tunnels/${accountId}/${tunnelId}`),
};

export const accountsApi = {
  list: () => api.get<ApiResponse<DnsAccount[]>>('/accounts'),
  providers: () => api.get<ApiResponse<Provider[]>>('/accounts/providers'),
  get: (id: number) => api.get<ApiResponse<DnsAccount>>(`/accounts/${id}`),
  create: (data: { type: string; name: string; config: Record<string, string | boolean>; remark?: string; team_id?: number }) =>
    api.post<ApiResponse<{ id: number }>>('/accounts', data),
  update: (id: number, data: { name?: string; config?: Record<string, string | boolean>; remark?: string }) =>
    api.put<ApiResponse<null>>(`/accounts/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<null>>(`/accounts/${id}`),
};

// ─── Domains ──────────────────────────────────────────────────────────────────

export const domainsApi = {
  list: (params?: { account_id?: number; keyword?: string; domain_type?: 'all' | 'apex' | 'subdomain' }) =>
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
  getFailover: (id: number) => api.get<ApiResponse<{ config: any, status: any } | null>>(`/domains/${id}/failover`),
  saveFailover: (id: number, data: any) => api.post<ApiResponse<any>>(`/domains/${id}/failover`, data),
  deleteFailover: (id: number) => api.delete<ApiResponse<any>>(`/domains/${id}/failover`),
};

// ─── Records ──────────────────────────────────────────────────────────────────

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

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  list: () => api.get<ApiResponse<User[]>>('/users'),
  create: (data: { username: string; nickname?: string; email?: string; password: string; role?: number }) =>
    api.post<ApiResponse<{ id: number }>>('/users', data),
  update: (id: number, data: { nickname?: string; email?: string; role?: number; status?: number; password?: string }) =>
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
  domainPermissions: (id: number) =>
    api.get<ApiResponse<DomainPermission[]>>(`/teams/${id}/domain-permissions`),
  addDomainPermission: (id: number, data: { domain_id: number; permission?: 'read' | 'write'; sub?: string }) =>
    api.post<ApiResponse<{ id: number }>>(`/teams/${id}/domain-permissions`, data),
  removeDomainPermission: (id: number, permId: number) =>
    api.delete<ApiResponse<null>>(`/teams/${id}/domain-permissions/${permId}`),
  memberDomainPermissions: (id: number, userId: number) =>
    api.get<ApiResponse<DomainPermission[]>>(`/teams/${id}/members/${userId}/domain-permissions`),
  addMemberDomainPermission: (id: number, userId: number, data: { domain_id: number; permission?: 'read' | 'write'; sub?: string }) =>
    api.post<ApiResponse<{ id: number }>>(`/teams/${id}/members/${userId}/domain-permissions`, data),
  removeMemberDomainPermission: (id: number, userId: number, permId: number) =>
    api.delete<ApiResponse<null>>(`/teams/${id}/members/${userId}/domain-permissions/${permId}`),
};

// ─── Logs ─────────────────────────────────────────────────────────────────────

export const logsApi = {
  list: (params?: { pageSize?: number; page?: number; domain?: string; userId?: number; action?: string; startDate?: string; endDate?: string }) =>
    api.get<ApiResponse<{ total: number; list: LogEntry[] }>>('/logs', { params }),
};

// ─── Initialization ───────────────────────────────────────────────────────────

export const initApi = {
  status: () => api.get<ApiResponse<{ initialized: boolean; dbInitialized: boolean; hasUsers: boolean }>>('/init/status'),
  testDb: (data: { type: 'sqlite' | 'mysql' | 'postgresql'; sqlite?: { path: string }; mysql?: { host: string; port: number; database: string; user: string; password: string; ssl?: boolean }; postgresql?: { host: string; port: number; database: string; user: string; password: string; ssl?: boolean } }) =>
    api.post<ApiResponse<{ success: boolean; message: string; hasExistingData?: boolean }>>('/init/test-db', data),
  initDatabase: (data: { type: 'sqlite' | 'mysql' | 'postgresql'; sqlite?: { path: string }; mysql?: { host: string; port: number; database: string; user: string; password: string; ssl?: boolean }; postgresql?: { host: string; port: number; database: string; user: string; password: string; ssl?: boolean } }) =>
    api.post<ApiResponse<{
      success: boolean;
      skipToComplete?: boolean;
      skipToUserCreation?: boolean;
      message?: string;
    }>>('/init/database', data),
  createAdmin: (data: { username: string; email: string; password: string }) =>
    api.post<ApiResponse<{ success: boolean }>>('/init/admin', data),
};

// ─── System ───────────────────────────────────────────────────────────────────

export interface SystemInfo {
  version: string;
  serverVersion: string;
  database: {
    type: string;
    version: string;
    driverVersion: string;
  };
  timezone: string;
  language: string;
}

export const systemApi = {
  info: () => api.get<ApiResponse<SystemInfo>>('/system/info'),
};

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface LoginLimitConfig {
  enabled: boolean;
  maxAttempts: number;
  lockoutDuration: number;
}

export interface LoginAttemptStats {
  totalLocked: number;
  recentAttempts: number;
  topIdentifiers: { identifier: string; attempts: number }[];
}

export interface JwtSecretInfo {
  jwtSecret: string;
}

export interface SmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
}

export interface SecurityConfig {
  jwtViewEmailNotify: boolean;
  domainExpiryNotify: boolean;
  domainExpiryDays: number;
}

export interface OAuthStatus {
  enabled: boolean;
  providerName: string;
  providers: Array<{ key: 'custom' | 'logto'; providerName: string }>;
}

export interface OAuthBinding {
  provider: string;
  subject: string;
  email: string;
  created_at: string;
}

export interface OAuthConfig {
  enabled: boolean;
  template: 'generic' | 'logto';
  providerName: string;
  subjectKey: string;
  emailKey: string;
  logtoDomain: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  jwksUri: string;
  scopes: string;
  redirectUri: string;
}

export const settingsApi = {
  getJwtSecret: (password: string) => api.post<ApiResponse<JwtSecretInfo>>('/settings/jwt-secret', { password }),
  getSmtpConfig: () => api.get<ApiResponse<SmtpConfig>>('/settings/smtp'),
  updateSmtpConfig: (data: Partial<SmtpConfig>) => api.put<ApiResponse<SmtpConfig>>('/settings/smtp', data),
  sendSmtpTest: (to?: string) => api.post<ApiResponse<null>>('/settings/smtp/test', { to }),
  getSecurityConfig: () => api.get<ApiResponse<SecurityConfig>>('/settings/security'),
  updateSecurityConfig: (data: Partial<SecurityConfig>) => api.put<ApiResponse<SecurityConfig>>('/settings/security', data),
  getOAuthConfig: () => api.get<ApiResponse<OAuthConfig>>('/settings/oauth'),
  updateOAuthConfig: (data: Partial<OAuthConfig>) => api.put<ApiResponse<OAuthConfig>>('/settings/oauth', data),
  getLogtoOAuthConfig: () => api.get<ApiResponse<OAuthConfig>>('/settings/oauth/logto'),
  updateLogtoOAuthConfig: (data: Partial<OAuthConfig>) => api.put<ApiResponse<OAuthConfig>>('/settings/oauth/logto', data),
  discoverOidc: (issuer: string) => api.post<ApiResponse<Partial<OAuthConfig>>>('/settings/oauth/oidc-discover', { issuer }),
  getLoginLimit: () => api.get<ApiResponse<LoginLimitConfig>>('/settings/login-limit'),
  updateLoginLimit: (data: Partial<LoginLimitConfig>) =>
    api.put<ApiResponse<LoginLimitConfig>>('/settings/login-limit', data),
  getLoginAttemptStats: () => api.get<ApiResponse<LoginAttemptStats>>('/settings/login-attempts/stats'),
  unlockAccount: (identifier: string) =>
    api.post<ApiResponse<null>>('/settings/login-attempts/unlock', { identifier }),
  getNotificationChannels: () => api.get<ApiResponse<any[]>>('/settings/notifications'),
  updateNotificationChannels: (channels: any[]) => api.put<ApiResponse<any>>('/settings/notifications', { channels }),
  getAuditRules: () => api.get<ApiResponse<any>>('/settings/audit-rules'),
  updateAuditRules: (rules: any) => api.put<ApiResponse<any>>('/settings/audit-rules', { rules }),
};

// ─── Tokens ───────────────────────────────────────────────────────────────────

export interface UserToken {
  id: number;
  name: string;
  allowed_domains: number[];
  allowed_services: string[];
  start_time: string | null;
  end_time: string | null;
  max_role: number;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export interface SecurityPolicy {
  id?: number;
  require2FAGlobal: boolean;
  minPasswordLength: number;
  minPasswordStrength: number;
  sessionTimeoutHours: number;
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
  allowRememberDevice: boolean;
  trustedDeviceDays: number;
  requirePasswordChangeOnFirstLogin: boolean;
  created_at?: string;
  updated_at?: string;
}

export const securityApi = {
  getPolicy: () => api.get<ApiResponse<SecurityPolicy>>('/security/policy'),
  updatePolicy: (data: Partial<SecurityPolicy>) => api.put<ApiResponse<SecurityPolicy>>('/security/policy', data),
  getUser2FARequirement: (userId: number) => api.get<ApiResponse<{ require2FA: boolean }>>(`/security/users/${userId}/require-2fa`),
  setUser2FARequirement: (userId: number, require2FA: boolean) =>
    api.put<ApiResponse<{ require2FA: boolean }>>(`/security/users/${userId}/require-2fa`, { require2FA }),
};

export const tokensApi = {
  getAll: () => api.get<ApiResponse<UserToken[]>>('/tokens'),
  create: (data: {
    name: string;
    allowed_domains: number[];
    start_time?: string;
    end_time?: string;
  }) => api.post<ApiResponse<{ token: string; tokenData: UserToken }>>('/tokens', data),
  delete: (id: number) => api.delete<ApiResponse<null>>(`/tokens/${id}`),
  toggleStatus: (id: number, is_active: boolean) =>
    api.patch<ApiResponse<null>>(`/tokens/${id}/status`, { is_active }),
  getDomains: () => api.get<ApiResponse<{ id: number; name: string; account_name: string }[]>>('/tokens/domains'),
};

// ─── NS Monitor ───────────────────────────────────────────────────────────────

export interface NSMonitorConfig {
  id: number;
  domain_id: number;
  domain_name: string;
  expected_ns: string;
  enabled: boolean;
  notify_email: boolean;
  notify_channels: boolean;
  current_ns?: string;
  status?: 'ok' | 'mismatch' | 'missing';
  last_check_at?: string;
  alert_count?: number;
}

export const nsMonitorApi = {
  list: () => api.get<ApiResponse<NSMonitorConfig[]>>('/ns-monitor'),
  get: (id: number) => api.get<ApiResponse<NSMonitorConfig & { alerts: any[] }>>(`/ns-monitor/${id}`),
  getByDomain: (domainId: number) => api.get<ApiResponse<NSMonitorConfig | null>>(`/ns-monitor/domain/${domainId}`),
  create: (data: { domain_id: number; expected_ns: string; enabled: boolean; notify_email: boolean; notify_channels: boolean }) =>
    api.post<ApiResponse<{ id: number }>>('/ns-monitor', data),
  update: (id: number, data: { domain_id: number; expected_ns: string; enabled: boolean; notify_email: boolean; notify_channels: boolean }) =>
    api.post<ApiResponse<{ id: number }>>('/ns-monitor', { ...data, id }),
  delete: (id: number) => api.delete<ApiResponse<null>>(`/ns-monitor/${id}`),
  check: (id: number) => api.post<ApiResponse<{ current_ns: string[]; expected_ns: string[]; status: string }>>(`/ns-monitor/${id}/check`, {}),
};

// ─── Network API ──────────────────────────────────────────────────────────────

export interface IpInfo {
  ip: string;
  type: 'v4' | 'v6';
  source: string;
  country?: string;
  region?: string;
  city?: string;
  isp?: string;
}

export interface NetworkInfo {
  server: {
    v4: IpInfo | null;
    v6: IpInfo | null;
  };
  serverDirect: {
    v4: IpInfo | null;
    v6: IpInfo | null;
  };
  client: {
    v4: IpInfo | null;
    v6: IpInfo | null;
  };
  proxy: {
    enabled: boolean;
    type: 'socks5' | 'http';
    host: string;
    port: number;
  } | null;
}

export interface ProxyConfig {
  enabled: boolean;
  type: 'socks5' | 'http';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export const networkApi = {
  getInfo: () => api.get<ApiResponse<NetworkInfo>>('/network/info'),
  getServerIp: () => api.get<ApiResponse<{ v4: IpInfo | null; v6: IpInfo | null }>>('/network/server-ip'),
  getClientIp: () => api.get<ApiResponse<{ v4: IpInfo | null; v6: IpInfo | null }>>('/network/client-ip'),
  getProxy: () => api.get<ApiResponse<ProxyConfig>>('/network/proxy'),
  updateProxy: (config: ProxyConfig) => api.post<ApiResponse<ProxyConfig>>('/network/proxy', config),
};
