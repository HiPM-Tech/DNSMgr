/**
 * React Query 配置 Hook
 * 
 * 提供统一的查询配置策略，确保数据一致性
 */

import type { UseQueryOptions } from '@tanstack/react-query';

/**
 * 实时性要求高的查询配置
 * - 适用于：账号状态、域名状态等需要立即反映变更的数据
 * - staleTime: 0 (数据立即过期)
 * - refetchOnMount: true (每次挂载都重新获取)
 * - refetchOnWindowFocus: true (窗口聚焦时重新获取)
 */
export function useRealtimeQueryConfig<T = unknown, E = Error>(
  options?: Omit<UseQueryOptions<T, E>, 'queryKey' | 'queryFn'>
): Omit<UseQueryOptions<T, E>, 'queryKey' | 'queryFn'> {
  return {
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    ...options,
  };
}

/**
 * 普通查询配置（默认）
 * - 适用于：列表数据、配置信息等不频繁变更的数据
 * - staleTime: 5分钟
 * - refetchOnMount: 'always' (总是检查是否需要重新获取)
 */
export function useDefaultQueryConfig<T = unknown, E = Error>(
  options?: Omit<UseQueryOptions<T, E>, 'queryKey' | 'queryFn'>
): Omit<UseQueryOptions<T, E>, 'queryKey' | 'queryFn'> {
  return {
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: 'always',
    ...options,
  };
}

/**
 * 低频更新查询配置
 * - 适用于：系统设置、用户偏好等很少变更的数据
 * - staleTime: 30分钟
 */
export function useLowFrequencyQueryConfig<T = unknown, E = Error>(
  options?: Omit<UseQueryOptions<T, E>, 'queryKey' | 'queryFn'>
): Omit<UseQueryOptions<T, E>, 'queryKey' | 'queryFn'> {
  return {
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnMount: 'always',
    ...options,
  };
}
