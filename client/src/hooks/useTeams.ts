/**
 * Teams 相关查询 Hook
 * 
 * 封装团队管理的查询逻辑，统一配置策略
 */

import { useQuery } from '@tanstack/react-query';
import { teamsApi } from '../api';

/**
 * 获取团队列表
 * - 使用默认配置（5分钟缓存）
 * - 团队信息变更频率较低
 */
export function useTeamsList() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list().then((r) => r.data.data ?? []),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: 'always',
  });
}

/**
 * 获取团队成员列表
 * - 使用实时配置（成员变更需要立即反映）
 */
export function useTeamMembers(teamId: number | null) {
  return useQuery({
    queryKey: ['team-members', teamId],
    queryFn: () => {
      if (!teamId) return Promise.resolve([]);
      return teamsApi.members(teamId).then((r) => r.data.data ?? []);
    },
    enabled: !!teamId,
    staleTime: 0, // Realtime for member changes
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}
