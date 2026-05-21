import { api, ApiResponse } from './client';
import type { User } from './types';

// ─── Users API ────────────────────────────────────────────────────────────────

export const usersApi = {
  list: () => api.get<ApiResponse<User[]>>('/users'),
  create: (data: { username: string; nickname?: string; email?: string; password: string; role?: number }) =>
    api.post<ApiResponse<{ id: number }>>('/users', data),
  update: (id: number, data: { nickname?: string; email?: string; role?: number; status?: number; password?: string }) =>
    api.put<ApiResponse<null>>(`/users/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<null>>(`/users/${id}`),
};
