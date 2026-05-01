/**
 * WebSocket Service
 * 提供实时推送功能，跟随 HTTP 协议
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { verifyToken } from './token';
import { log } from '../lib/logger';
import { getClientIP } from '../middleware/clientIP';

interface WSClient {
  ws: WebSocket;
  userId: number;
  role: string;
  isAlive: boolean;
}

class WSService {
  private wss: WebSocketServer | null = null;
  private clients: Map<number, WSClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  /**
   * 初始化 WebSocket 服务器
   */
  initialize(server: any): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      maxPayload: 1024 * 1024, // 1MB
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error: Error) => {
      log.error('WSService', 'WebSocket server error', { error: error.message });
    });

    // 启动心跳检测
    this.startHeartbeat();

    log.info('WSService', 'WebSocket server initialized on /ws');
  }

  /**
   * 处理 WebSocket 连接
   */
  private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    // 使用 getClientIP 获取真实客户端 IP（支持反向代理）
    const clientIp = getClientIP(req as any);
    log.info('WSService', 'New WebSocket connection attempt', { ip: clientIp });
    
    try {
      // 从 URL 参数或 Cookie 中获取 token
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token') || 
                    req.headers.cookie?.match(/token=([^;]+)/)?.[1];

      if (!token) {
        log.warn('WSService', 'WebSocket connection rejected: no token', { ip: clientIp });
        ws.close(4001, 'Authentication required');
        return;
      }

      // 验证 token
      const payload = await verifyToken(token);
      if (!payload) {
        log.warn('WSService', 'WebSocket connection rejected: invalid token', { ip: clientIp });
        ws.close(4002, 'Invalid token');
        return;
      }

      const userId = payload.userId;
      const role = String(payload.maxRole);
      
      log.info('WSService', 'WebSocket authentication successful', { userId, role, ip: clientIp });

      // 如果已存在连接，关闭旧连接
      const existingClient = this.clients.get(userId);
      if (existingClient) {
        log.info('WSService', 'Closing existing WebSocket connection', { userId });
        existingClient.ws.close(4000, 'New connection established');
      }

      // 注册新客户端
      const client: WSClient = {
        ws,
        userId,
        role,
        isAlive: true,
      };

      this.clients.set(userId, client);

      log.info('WSService', 'WebSocket client connected', { 
        userId, 
        role,
        totalClients: this.clients.size 
      });

      // 发送欢迎消息
      this.sendToClient(userId, {
        type: 'connected',
        data: { message: 'WebSocket connected successfully' },
      });

      // 处理消息
      ws.on('message', (data: string) => {
        this.handleMessage(userId, data.toString());
      });

      // 处理断开连接
      ws.on('close', () => {
        this.handleDisconnect(userId);
      });

      // 处理错误
      ws.on('error', (error: Error) => {
        log.error('WSService', 'WebSocket client error', { 
          userId, 
          error: error.message 
        });
        this.handleDisconnect(userId);
      });

      // 心跳响应
      ws.on('pong', () => {
        const client = this.clients.get(userId);
        if (client) {
          client.isAlive = true;
        }
      });

    } catch (error) {
      log.error('WSService', 'WebSocket connection error', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      ws.close(4003, 'Internal server error');
    }
  }

  /**
   * 处理客户端消息
   */
  private handleMessage(userId: number, message: string): void {
    try {
      const data = JSON.parse(message);
      log.debug('WSService', 'Received message from client', { userId, type: data.type });

      // 可以根据消息类型处理不同的请求
      switch (data.type) {
        case 'ping':
          this.sendToClient(userId, { type: 'pong' });
          break;
        default:
          log.warn('WSService', 'Unknown message type', { userId, type: data.type });
      }
    } catch (error) {
      log.error('WSService', 'Failed to parse message', { 
        userId, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * 处理客户端断开连接
   */
  private handleDisconnect(userId: number): void {
    const client = this.clients.get(userId);
    if (client) {
      this.clients.delete(userId);
      log.info('WSService', 'WebSocket client disconnected', { 
        userId,
        totalClients: this.clients.size 
      });
    }
  }

  /**
   * 启动心跳检测（每 30 秒）
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client, userId) => {
        if (!client.isAlive) {
          log.warn('WSService', 'Client failed heartbeat, disconnecting', { userId });
          client.ws.terminate();
          this.clients.delete(userId);
          return;
        }

        client.isAlive = false;
        client.ws.ping();
      });
    }, 30000);
  }

  /**
   * 向指定用户发送消息
   */
  sendToClient(userId: number, message: any): boolean {
    const client = this.clients.get(userId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      log.error('WSService', 'Failed to send message to client', { 
        userId, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * 向所有在线用户广播消息
   */
  broadcast(message: any): void {
    const data = JSON.stringify(message);
    this.clients.forEach((client, userId) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(data);
        } catch (error) {
          log.error('WSService', 'Failed to broadcast to client', { 
            userId, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }
    });
  }

  /**
   * 向指定角色的用户广播消息
   */
  broadcastToRole(role: string, message: any): void {
    const data = JSON.stringify(message);
    this.clients.forEach((client, userId) => {
      if (client.role === role && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(data);
        } catch (error) {
          log.error('WSService', 'Failed to broadcast to role', { 
            userId, 
            role,
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }
    });
  }

  /**
   * 停止 WebSocket 服务
   */
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    this.clients.forEach((client, userId) => {
      client.ws.close(1001, 'Server shutting down');
    });
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    log.info('WSService', 'WebSocket server shut down');
  }

  /**
   * 获取在线客户端数量
   */
  getClientCount(): number {
    return this.clients.size;
  }
}

// 导出单例
export const wsService = new WSService();
