import { api, ApiResponse } from './client';
import type { Team, TeamMember, DomainPermission } from './types';

// ─── Teams API ────────────────────────────────────────────────────────────────

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
