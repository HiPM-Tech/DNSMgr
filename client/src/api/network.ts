import { api, ApiResponse } from './client';
import type { ProxyConfig, ConnectivityResponse } from './types';

// ─── Network API ──────────────────────────────────────────────────────────────

export const networkApi = {
  getProxy: () => api.get<ApiResponse<ProxyConfig>>('/network/proxy'),
  updateProxy: (config: ProxyConfig) => api.post<ApiResponse<ProxyConfig>>('/network/proxy', config),
  testConnectivity: () => api.get<ApiResponse<ConnectivityResponse>>('/network/connectivity'),
};
