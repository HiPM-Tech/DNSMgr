/**
 * 续期域名相关查询 Hook
 * 
 * 封装续期域名的查询逻辑，统一配置策略
 */

import { useQuery } from '@tanstack/react-query';
import { domainRenewalApi } from '../api';

/**
 * 获取所有续期域名列表
 * - 使用实时配置（域名状态频繁变化）
 * - 包括启用和禁用的域名
 */
export function useRenewableDomains() {
  return useQuery({
    queryKey: ['renewable-domains'],
    queryFn: () => domainRenewalApi.getRenewableDomains().then((r) => r.data.data ?? []),
    staleTime: 0, // Realtime for domain status changes
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}
