import { api } from './client';
import type { ApiResponse } from './client';

// ─── MCP API Types ───────────────────────────────────────────────────────────────

export interface McpApiKey {
  id: number;
  api_key: string;
  description: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface McpGlobalConfig {
  id: number;
  enabled: boolean;
  updated_by?: number;
  updated_at: string;
}

export interface McpAuditLog {
  id: number;
  user_id: number;
  auth_type: string;
  client_id?: string;
  module: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  request_params?: string;
  response_status: string;
  ip_address?: string;
  created_at: string;
}

export interface McpAuditStats {
  user_id: number;
  period_days: number;
  start_date: string;
  action_statistics: Array<{ action: string; count: number }>;
  time_distribution: Array<{ hour: string; count: number }>;
  anomaly_detection: {
    delete_operations: number;
    create_operations: number;
    unique_domains: number;
  };
}

export interface McpOAuthClient {
  id: number;
  client_id: string;
  app_name: string;
  redirect_uris: string;
  scope?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface McpOAuthAccessToken {
  id: number;
  access_token: string;
  client_id: string;
  app_name: string;
  scope?: string;
  expires_at: string;
  revoked_at?: string;
  created_at: string;
}

// ─── MCP API ───────────────────────────────────────────────────────────────

export const mcpApi = {
  // Global Config
  getGlobalConfig: () => api.get<ApiResponse<McpGlobalConfig>>('/mcp/config'),
  updateGlobalConfig: (enabled: boolean) => 
    api.put<ApiResponse<null>>('/mcp/config', { enabled }),

  // API Keys
  getApiKeys: () => api.get<ApiResponse<McpApiKey[]>>('/mcp/api-keys'),
  createApiKey: (data: { description: string; expiresAt?: string }) => 
    api.post<ApiResponse<{ apiKey: string; keyData: McpApiKey }>>('/mcp/api-keys', data),
  revokeApiKey: (keyId: number) => 
    api.post<ApiResponse<null>>(`/mcp/api-keys/${keyId}/revoke`),
  deleteApiKey: (keyId: number) => 
    api.delete<ApiResponse<null>>(`/mcp/api-keys/${keyId}`),

  // Audit Logs
  getAuditLogs: (params: {
    userId?: number;
    action?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  }) => api.get<ApiResponse<{
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    logs: McpAuditLog[];
  }>>('/mcp/audit-logs', { params }),

  getAuditStats: (userId: number, days?: number) => 
    api.get<ApiResponse<McpAuditStats>>(`/mcp/audit-stats/${userId}`, { 
      params: { days } 
    }),

  exportAuditLogs: (params: {
    format: 'csv' | 'json';
    userId?: number;
    action?: string;
    startDate: string;
    endDate: string;
  }) => api.get<ApiResponse<{
    format: string;
    content_type: string;
    record_count: number;
    data: string;
  }>>('/mcp/audit-logs/export', { params }),

  // OAuth Clients
  getOAuthClients: () => api.get<ApiResponse<McpOAuthClient[]>>('/mcp/oauth/clients'),
  createOAuthClient: (data: { app_name: string; redirect_uris: string[]; scope?: string }) =>
    api.post<ApiResponse<{ client_id: string; client_secret: string }>>('/mcp/oauth/clients', data),
  deleteOAuthClient: (clientId: string) =>
    api.delete<ApiResponse<null>>(`/mcp/oauth/clients/${clientId}`),
  updateOAuthClientScope: (clientId: string, scope: string) =>
    api.put<ApiResponse<null>>(`/mcp/oauth/clients/${clientId}/scope`, { scope }),
  updateOAuthClientExpiry: (clientId: string, expires_at: string | null) =>
    api.put<ApiResponse<null>>(`/mcp/oauth/clients/${clientId}/expiry`, { expires_at }),

  // OAuth Tokens
  getOAuthTokens: () => api.get<ApiResponse<McpOAuthAccessToken[]>>('/mcp/oauth/tokens'),
  revokeOAuthToken: (tokenId: number) =>
    api.post<ApiResponse<null>>(`/mcp/oauth/tokens/${tokenId}/revoke`),
};
