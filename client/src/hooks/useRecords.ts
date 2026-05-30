/**
 * DNS 记录相关查询 Hook
 * 
 * 封装 DNS 记录的查询逻辑，统一配置策略
 */

import { useQuery } from '@tanstack/react-query';
import { recordsApi } from '../api';

export interface UseRecordsListParams {
  domainId: number;
  type?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 获取 DNS 记录列表（带分页和过滤）
 * - 使用实时配置（记录频繁变更）
 * - 支持类型过滤、关键字搜索、分页
 */
export function useRecordsList({
  domainId,
  type,
  keyword,
  page = 1,
  pageSize = 20,
}: UseRecordsListParams) {
  return useQuery({
    queryKey: ['records', domainId, type, keyword, page, pageSize],
    queryFn: () =>
      recordsApi.list(domainId, {
        type: type || undefined,
        keyword: keyword || undefined,
        page,
        pageSize,
      }).then((r) => r.data.data),
    staleTime: 0, // Realtime for record changes
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}
