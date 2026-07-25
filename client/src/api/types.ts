// ─── Shared Type Definitions ──────────────────────────────────────────────────

import type { RecordType } from '../types/record-types';

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
    dns: {
      remark: boolean;
      status: boolean;
      redirect: boolean;
      weight: boolean;
      proxiable: boolean;
      cnameFlattening: boolean;
      recordTypes: RecordType[];
    } | null;
    log: boolean;
    renewal: boolean;
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
  enabled?: boolean;
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
  enabled?: number; // 0 = disabled, 1 or undefined = enabled
  record_count?: number;
  expires_at?: string;
  apex_expires_at?: string;  // 根域名到期时间（仅对子域名有效）
  whois_status?: string;  // WHOIS状态（如OK、clientHold等）
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
  exists?: boolean;
  existsOther?: boolean;
  parentExists?: boolean;
}

export interface DnsRecord {
  id: string;
  name: string;
  type: RecordType;
  value: string;
  line?: string;
  cloudflare?: {
    proxied?: boolean;
    proxiable?: boolean;
  } | null;
  aliyunesa?: {
    proxied?: boolean;
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
  name?: string;
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

export interface Tunnel {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

export interface TunnelConfig {
  [key: string]: unknown;
}

export interface RenewalInfo {
  subdomain_id: number;
  subdomain: string;
  full_domain: string;
  previous_expires_at: string;
  new_expires_at: string;
  renewed_at: string;
  never_expires: number;
  status: string;
  remaining_days: number;
}

export interface WhoisInfo {
  domain: string;
  expires_at?: string;
  registrar?: string;
  status?: string;
}

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
  showDnsProviderSecrets: boolean;
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

export interface IpInfo {
  ip: string;
  type: 'v4' | 'v6';
  source: string;
  country?: string;
  region?: string;
  city?: string;
  isp?: string;
}

export interface ProxyConfig {
  enabled: boolean;
  type: 'socks5' | 'http';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface ConnectivityResult {
  name: string;
  url: string;
  status: 'ok' | 'error' | 'timeout';
  latency: number;
  error?: string;
}

export interface ConnectivityResponse {
  proxyEnabled: boolean;
  results: ConnectivityResult[];
}
