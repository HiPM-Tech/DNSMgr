import { api, ApiResponse } from './client';

// ─── Initialization API ───────────────────────────────────────────────────────

export type InitDatabaseType = 'sqlite' | 'mysql' | 'postgresql';

export interface InitDbConfig {
  type: InitDatabaseType;
  sqlite?: { path?: string };
  mysql?: { host?: string; port?: number; database?: string; user?: string; password?: string; ssl?: boolean };
  postgresql?: { host?: string; port?: number; database?: string; user?: string; password?: string; ssl?: boolean };
}

export const initApi = {
  dbConfig: () => api.get<ApiResponse<InitDbConfig>>('/init/db-config'),
  status: () => api.get<ApiResponse<{ initialized: boolean; dbInitialized: boolean; hasUsers: boolean }>>('/init/status'),
  testDb: (data: { type: InitDatabaseType; sqlite?: { path: string }; mysql?: { host: string; port: number; database: string; user: string; password: string; ssl?: boolean }; postgresql?: { host: string; port: number; database: string; user: string; password: string; ssl?: boolean } }) =>
    api.post<ApiResponse<{ success: boolean; message: string; hasExistingData?: boolean }>>('/init/test-db', data),
  initDatabase: (data: { type: InitDatabaseType; sqlite?: { path: string }; mysql?: { host: string; port: number; database: string; user: string; password: string; ssl?: boolean }; postgresql?: { host: string; port: number; database: string; user: string; password: string; ssl?: boolean } }) =>
    api.post<ApiResponse<{
      success: boolean;
      skipToComplete?: boolean;
      skipToUserCreation?: boolean;
      message?: string;
    }>>('/init/database', data),
  createAdmin: (data: { username: string; email: string; password: string }) =>
    api.post<ApiResponse<{ success: boolean }>>('/init/admin', data),
};
