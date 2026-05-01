# WebSocket 实时推送功能

## 📖 概述

DNSMgr 现已支持 WebSocket 实时推送，可以在后端数据变更时立即通知前端，无需轮询。

## 🚀 快速开始

### 1. 后端集成

WebSocket 服务已自动集成到 HTTP 服务器中，路径为 `/ws`。

**在 `app.ts` 中初始化：**

```typescript
import { wsService } from './service/websocket';

// 创建 HTTP 服务器
const server = http.createServer(app);

// 初始化 WebSocket
wsService.initialize(server);

// 启动服务器
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
```

### 2. 前端使用

**基本用法：**

```typescript
import { useWebSocket } from '../hooks/useWebSocket';

function MyComponent() {
  const { isConnected, sendMessage } = useWebSocket({
    onMessage: (message) => {
      console.log('Received:', message);
      
      // 处理不同类型的消息
      switch (message.type) {
        case 'domain_updated':
          // 刷新域名列表
          queryClient.invalidateQueries({ queryKey: ['domains'] });
          break;
        case 'account_updated':
          // 刷新账号列表
          queryClient.invalidateQueries({ queryKey: ['accounts'] });
          break;
      }
    },
    onConnected: () => {
      console.log('WebSocket connected');
    },
    onDisconnected: () => {
      console.log('WebSocket disconnected');
    },
  });

  return (
    <div>
      <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
    </div>
  );
}
```

## 📨 消息类型

### 后端推送的消息

| 类型 | 说明 | 数据结构 |
|------|------|---------|
| `connected` | 连接成功 | `{ type: 'connected', data: { message: string } }` |
| `domain_created` | 域名创建 | `{ type: 'domain_created', data: { domainId, name } }` |
| `domain_updated` | 域名更新 | `{ type: 'domain_updated', data: { domainId, name } }` |
| `domain_deleted` | 域名删除 | `{ type: 'domain_deleted', data: { domainId, name } }` |
| `account_created` | 账号创建 | `{ type: 'account_created', data: { accountId, name } }` |
| `account_updated` | 账号更新 | `{ type: 'account_updated', data: { accountId, name } }` |
| `account_deleted` | 账号删除 | `{ type: 'account_deleted', data: { accountId, name } }` |
| `record_created` | DNS记录创建 | `{ type: 'record_created', data: { recordId, domainId } }` |
| `record_updated` | DNS记录更新 | `{ type: 'record_updated', data: { recordId, domainId } }` |
| `record_deleted` | DNS记录删除 | `{ type: 'record_deleted', data: { recordId, domainId } }` |

### 前端发送的消息

| 类型 | 说明 | 数据结构 |
|------|------|---------|
| `ping` | 心跳检测 | `{ type: 'ping' }` |

## 🔧 API 参考

### `useWebSocket(options)`

**参数：**

```typescript
interface UseWebSocketOptions {
  onMessage?: (message: WSMessage) => void;  // 收到消息时的回调
  onConnected?: () => void;                   // 连接成功时的回调
  onDisconnected?: () => void;                // 断开连接时的回调
  onError?: (error: Event) => void;           // 发生错误时的回调
  autoReconnect?: boolean;                    // 是否自动重连（默认 true）
  reconnectInterval?: number;                 // 重连间隔（毫秒，默认 3000）
  maxReconnectAttempts?: number;              // 最大重连次数（默认 10）
}
```

**返回值：**

```typescript
{
  isConnected: boolean;     // 是否已连接
  sendMessage: (message: any) => boolean;  // 发送消息
  connect: () => void;      // 手动连接
  disconnect: () => void;   // 手动断开
}
```

## 💡 最佳实践

### 1. 在域名列表页面使用

```typescript
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '../hooks/useWebSocket';

function DomainListTab() {
  const queryClient = useQueryClient();
  
  useWebSocket({
    onMessage: (message) => {
      // 根据消息类型刷新对应的查询
      if (message.type.startsWith('domain_')) {
        queryClient.invalidateQueries({ queryKey: ['domains'] });
      }
    },
  });
  
  // ... 其余代码
}
```

### 2. 在账号页面使用

```typescript
function Accounts() {
  const queryClient = useQueryClient();
  
  useWebSocket({
    onMessage: (message) => {
      if (message.type.startsWith('account_')) {
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
      }
    },
  });
  
  // ... 其余代码
}
```

### 3. 显示连接状态

```typescript
function ConnectionStatus() {
  const { isConnected } = useWebSocket();
  
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${
        isConnected ? 'bg-green-500' : 'bg-red-500'
      }`} />
      <span className="text-sm text-gray-600">
        {isConnected ? '实时连接' : '已断开'}
      </span>
    </div>
  );
}
```

## 🔐 认证与安全

WebSocket 连接需要有效的 JWT Token：

1. **URL 参数方式**：`ws://localhost:3000/ws?token=YOUR_TOKEN`
2. **Cookie 方式**：自动从 Cookie 中读取 `token`

Token 验证失败时，连接会被拒绝并返回相应的错误码：
- `4001`: 未提供 Token
- `4002`: Token 无效
- `4003`: 服务器内部错误

## 🔄 自动重连机制

WebSocket 客户端实现了智能重连：

1. **指数退避**：重连间隔逐渐增加（3s → 6s → 12s → ...）
2. **最大重试次数**：默认 10 次，防止无限重连
3. **认证错误不重连**：Token 无效时不会自动重连

## 📊 性能优化建议

1. **按需订阅**：只在需要的页面启用 WebSocket
2. **批量更新**：多个相关变更合并为一条消息
3. **防抖处理**：短时间内多次相同类型的更新只触发一次刷新

## 🐛 调试技巧

### 浏览器控制台

```javascript
// 查看 WebSocket 连接状态
console.log('WebSocket readyState:', ws.readyState);
// 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
```

### 后端日志

```
[INFO] WSService - WebSocket client connected { userId: 1, role: '3', totalClients: 5 }
[INFO] WSService - WebSocket client disconnected { userId: 1, totalClients: 4 }
```

## ⚠️ 注意事项

1. **HTTPS 环境**：生产环境必须使用 `wss://` 协议
2. **防火墙配置**：确保 WebSocket 端口未被阻止
3. **负载均衡**：如果使用多实例，需要使用 sticky sessions 或 Redis adapter
4. **内存管理**：定期清理断开的连接，避免内存泄漏

## 📝 待实现功能

- [ ] 消息持久化（离线消息）
- [ ] 房间/频道订阅
- [ ] 消息确认机制
- [ ] Redis adapter（多实例支持）
- [ ] 消息压缩
