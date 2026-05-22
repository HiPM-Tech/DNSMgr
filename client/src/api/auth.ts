import { api } from './client';
import type { ApiResponse } from './client';
import type { User, WebAuthnResponse, WebAuthnCredential, OAuthStatus, OAuthBinding, FailoverData } from './types';

// ─── Auth API ─────────────────────────────────────────────────────────────────

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
  createFailover: (id: number, data: Partial<any>) => api.post<ApiResponse<any>>(`/domains/${id}/failover`, data),
  updateFailover: (id: number, data: Partial<any>) => api.put<ApiResponse<any>>(`/domains/${id}/failover`, data),
  deleteFailover: (id: number) => api.delete<ApiResponse<null>>(`/domains/${id}/failover`),
  getPreferences: () => api.get<ApiResponse<{ theme: string; language: string; notificationsEnabled: boolean; emailNotifications: boolean; backgroundImage?: string; avatarImage?: string }>>('/auth/preferences'),
  updatePreferences: (data: { theme?: string; language?: string; notificationsEnabled?: boolean; emailNotifications?: boolean; backgroundImage?: string; avatarImage?: string }) =>
    api.put<ApiResponse<null>>('/auth/preferences', data),
  getPinnedDomains: () => api.get<ApiResponse<{ pinnedDomains: number[] }>>('/auth/preferences/pinned-domains'),
  updatePinnedDomains: (domainIds: number[]) =>
    api.put<ApiResponse<null>>('/auth/preferences/pinned-domains', { domainIds }),
};
