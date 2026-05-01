/**
 * 实时数据 Hook
 * 支持 WebSocket 实时推送 + 轮询降级
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';

interface UseRealtimeOptions {
  queryKey: any[];              // React Query 的查询键
  websocketEventTypes: string[]; // 监听的 WebSocket 事件类型
  pollingInterval?: number;     // 轮询间隔（毫秒），默认 60000
  enabled?: boolean;            // 是否启用
}

export function useRealtimeData(options: UseRealtimeOptions) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasWsConnectionRef = useRef(false);

  const {
    queryKey,
    websocketEventTypes,
    pollingInterval = 60000,
    enabled = true,
  } = options;

  // 刷新数据
  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  // 连接 WebSocket
  const connectWebSocket = useCallback(() => {
    if (!token || !enabled) return;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws?token=${token}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[Realtime] WebSocket connected');
        hasWsConnectionRef.current = true;
        
        // 停止轮询
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          // 检查是否是感兴趣的事件类型
          if (websocketEventTypes.includes(message.type)) {
            console.log('[Realtime] Received relevant event:', message.type);
            refreshData();
          }
        } catch (error) {
          console.error('[Realtime] Failed to parse message:', error);
        }
      };

      ws.onclose = () => {
        console.log('[Realtime] WebSocket disconnected');
        hasWsConnectionRef.current = false;
        wsRef.current = null;
        
        // 启动轮询降级
        startPolling();
      };

      ws.onerror = () => {
        console.warn('[Realtime] WebSocket error, falling back to polling');
        hasWsConnectionRef.current = false;
      };

    } catch (error) {
      console.error('[Realtime] WebSocket connection failed:', error);
      hasWsConnectionRef.current = false;
      startPolling();
    }
  }, [token, enabled, websocketEventTypes, refreshData]);

  // 启动轮询
  const startPolling = useCallback(() => {
    if (!enabled) return;

    // 如果已有轮询，先清除
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    console.log(`[Realtime] Starting polling every ${pollingInterval}ms`);
    
    pollingIntervalRef.current = setInterval(() => {
      if (!hasWsConnectionRef.current) {
        console.log('[Realtime] Polling refresh');
        refreshData();
      }
    }, pollingInterval);
  }, [enabled, pollingInterval, refreshData]);

  // 停止轮询
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // 断开 WebSocket
  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnecting');
      wsRef.current = null;
    }
    hasWsConnectionRef.current = false;
  }, []);

  // 初始化
  useEffect(() => {
    if (!enabled) return;

    // 尝试 WebSocket 连接
    connectWebSocket();

    // 如果 3 秒后还没有建立 WebSocket 连接，启动轮询
    const fallbackTimer = setTimeout(() => {
      if (!hasWsConnectionRef.current) {
        console.warn('[Realtime] WebSocket not connected, starting polling fallback');
        startPolling();
      }
    }, 3000);

    return () => {
      clearTimeout(fallbackTimer);
      disconnectWebSocket();
      stopPolling();
    };
  }, [enabled, connectWebSocket, startPolling, stopPolling, disconnectWebSocket]);

  return {
    hasWsConnection: hasWsConnectionRef.current,
    refreshData,
  };
}
