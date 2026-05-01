# WebSocket 后端推送实现指南

## 📖 概述

本文档说明如何在后端路由中添加 WebSocket 消息推送，以实现前端实时更新。

---

## ✅ 已完成的工作

### 1. WebSocket 服务初始化

已在 `server/src/app.ts` 中完成：

```typescript
import http from 'http';
import { wsService } from './service/websocket';

// 创建 HTTP 服务器并初始化 WebSocket
const server = http.createServer(app);
wsService.initialize(server);
server.listen(PORT, () => { ... });

// 优雅关闭时清理 WebSocket
process.on('SIGTERM', async () => {
  wsService.shutdown();
  // ... 其他清理工作
});
```

---

## 🔧 需要添加推送的路由

### 1. 域名路由 (`server/src/routes/domains.ts`)

#### 创建域名

```typescript
import { wsService } from '../service/websocket';

router.post('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const newDomain = await DomainOperations.create(req.body);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'domain_created',
    data: {
      domainId: newDomain.id,
      name: newDomain.name,
      accountId: newDomain.account_id,
    },
  });
  
  log.info('Domains', 'Domain created and broadcasted', { domainId: newDomain.id });
  sendSuccess(res, newDomain, 'Domain created successfully');
}));
```

#### 更新域名

```typescript
router.put('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updatedDomain = await DomainOperations.update(id, req.body);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'domain_updated',
    data: {
      domainId: updatedDomain.id,
      name: updatedDomain.name,
    },
  });
  
  sendSuccess(res, updatedDomain, 'Domain updated successfully');
}));
```

#### 删除域名

```typescript
router.delete('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const domain = await DomainOperations.getById(id);
  
  await DomainOperations.delete(id);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'domain_deleted',
    data: {
      domainId: id,
      name: domain?.name,
    },
  });
  
  sendSuccess(res, null, 'Domain deleted successfully');
}));
```

---

### 2. 账号路由 (`server/src/routes/accounts.ts`)

#### 创建账号

```typescript
import { wsService } from '../service/websocket';

router.post('/', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const newAccount = await AccountOperations.create(req.body);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'account_created',
    data: {
      accountId: newAccount.id,
      name: newAccount.name,
      type: newAccount.type,
    },
  });
  
  sendSuccess(res, newAccount, 'Account created successfully');
}));
```

#### 更新账号

```typescript
router.put('/:id', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updatedAccount = await AccountOperations.update(id, req.body);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'account_updated',
    data: {
      accountId: updatedAccount.id,
      name: updatedAccount.name,
    },
  });
  
  sendSuccess(res, updatedAccount, 'Account updated successfully');
}));
```

#### 删除账号

```typescript
router.delete('/:id', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const account = await AccountOperations.getById(id);
  
  await AccountOperations.delete(id);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'account_deleted',
    data: {
      accountId: id,
      name: account?.name,
    },
  });
  
  sendSuccess(res, null, 'Account deleted successfully');
}));
```

---

### 3. DNS 记录路由 (`server/src/routes/records.ts`)

#### 创建记录

```typescript
import { wsService } from '../service/websocket';

router.post('/:domainId/records', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const domainId = Number(req.params.domainId);
  const newRecord = await RecordOperations.create(domainId, req.body);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'record_created',
    data: {
      recordId: newRecord.id,
      domainId: domainId,
      host: newRecord.host,
      type: newRecord.type,
    },
  });
  
  sendSuccess(res, newRecord, 'Record created successfully');
}));
```

#### 更新记录

```typescript
router.put('/:domainId/records/:recordId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const domainId = Number(req.params.domainId);
  const recordId = req.params.recordId;
  const updatedRecord = await RecordOperations.update(domainId, recordId, req.body);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'record_updated',
    data: {
      recordId: updatedRecord.id,
      domainId: domainId,
    },
  });
  
  sendSuccess(res, updatedRecord, 'Record updated successfully');
}));
```

#### 删除记录

```typescript
router.delete('/:domainId/records/:recordId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const domainId = Number(req.params.domainId);
  const recordId = req.params.recordId;
  
  await RecordOperations.delete(domainId, recordId);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'record_deleted',
    data: {
      recordId: recordId,
      domainId: domainId,
    },
  });
  
  sendSuccess(res, null, 'Record deleted successfully');
}));
```

#### 更新记录状态

```typescript
router.patch('/:domainId/records/:recordId/status', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const domainId = Number(req.params.domainId);
  const recordId = req.params.recordId;
  const { status } = req.body;
  
  const updatedRecord = await RecordOperations.setStatus(domainId, recordId, status);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'record_status_changed',
    data: {
      recordId: recordId,
      domainId: domainId,
      status: updatedRecord.status,
    },
  });
  
  sendSuccess(res, updatedRecord, 'Record status updated successfully');
}));
```

---

### 4. 用户路由 (`server/src/routes/users.ts`)

#### 创建用户

```typescript
import { wsService } from '../service/websocket';

router.post('/', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const newUser = await UserOperations.create(req.body);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'user_created',
    data: {
      userId: newUser.id,
      username: newUser.username,
      role: newUser.role,
    },
  });
  
  sendSuccess(res, newUser, 'User created successfully');
}));
```

#### 更新用户

```typescript
router.put('/:id', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updatedUser = await UserOperations.update(id, req.body);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'user_updated',
    data: {
      userId: updatedUser.id,
      username: updatedUser.username,
    },
  });
  
  sendSuccess(res, updatedUser, 'User updated successfully');
}));
```

#### 删除用户

```typescript
router.delete('/:id', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const user = await UserOperations.getById(id);
  
  await UserOperations.delete(id);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'user_deleted',
    data: {
      userId: id,
      username: user?.username,
    },
  });
  
  sendSuccess(res, null, 'User deleted successfully');
}));
```

---

### 5. 团队路由 (`server/src/routes/teams.ts`)

#### 创建团队

```typescript
import { wsService } from '../service/websocket';

router.post('/', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const newTeam = await TeamOperations.create(req.body);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'team_created',
    data: {
      teamId: newTeam.id,
      name: newTeam.name,
    },
  });
  
  sendSuccess(res, newTeam, 'Team created successfully');
}));
```

#### 添加团队成员

```typescript
router.post('/:id/members', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const teamId = Number(req.params.id);
  const { userId, role } = req.body;
  
  const member = await TeamOperations.addMember(teamId, userId, role);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'team_member_added',
    data: {
      teamId: teamId,
      userId: userId,
      role: role,
    },
  });
  
  sendSuccess(res, member, 'Member added successfully');
}));
```

#### 移除团队成员

```typescript
router.delete('/:teamId/members/:userId', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const teamId = Number(req.params.teamId);
  const userId = Number(req.params.userId);
  
  await TeamOperations.removeMember(teamId, userId);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'team_member_removed',
    data: {
      teamId: teamId,
      userId: userId,
    },
  });
  
  sendSuccess(res, null, 'Member removed successfully');
}));
```

---

### 6. Token 路由 (`server/src/routes/tokens.ts`)

#### 创建 Token

```typescript
import { wsService } from '../service/websocket';

router.post('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const newToken = await TokenOperations.create(req.user!.userId, req.body);
  
  // 推送 WebSocket 消息
  wsService.sendToClient(req.user!.userId, {
    type: 'token_created',
    data: {
      tokenId: newToken.id,
      name: newToken.name,
    },
  });
  
  // 也广播给所有管理员
  wsService.broadcastToRole('3', {
    type: 'token_created',
    data: {
      tokenId: newToken.id,
      userId: req.user!.userId,
    },
  });
  
  sendSuccess(res, newToken, 'Token created successfully');
}));
```

#### 撤销 Token

```typescript
router.delete('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const token = await TokenOperations.getById(id);
  
  await TokenOperations.revoke(id);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'token_revoked',
    data: {
      tokenId: id,
      userId: token?.user_id,
    },
  });
  
  sendSuccess(res, null, 'Token revoked successfully');
}));
```

---

### 7. 审计日志（自动推送）

在 `server/src/service/audit.ts` 中的 `logAuditOperation` 函数中添加：

```typescript
import { wsService } from './websocket';

export async function logAuditOperation(
  userId: number,
  action: string,
  domain?: string,
  details?: any,
  req?: Request
): Promise<void> {
  // ... 现有的审计日志逻辑
  
  // 推送 WebSocket 消息（仅对管理员）
  wsService.broadcastToRole('3', {
    type: 'audit_log_created',
    data: {
      action: action,
      domain: domain,
      timestamp: new Date().toISOString(),
    },
  });
}
```

---

### 8. 系统配置路由 (`server/src/routes/settings.ts`)

#### 更新 SMTP 配置

```typescript
import { wsService } from '../service/websocket';

router.put('/smtp', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  await SettingsOperations.updateSmtpConfig(req.body);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'smtp_updated',
    data: {
      updatedBy: req.user!.userId,
      timestamp: new Date().toISOString(),
    },
  });
  
  sendSuccess(res, null, 'SMTP configuration updated');
}));
```

#### 更新 OAuth 配置

```typescript
router.put('/oauth', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  await SettingsOperations.updateOAuthConfig(req.body);
  
  // 推送 WebSocket 消息
  wsService.broadcast({
    type: 'oauth_updated',
    data: {
      updatedBy: req.user!.userId,
      timestamp: new Date().toISOString(),
    },
  });
  
  sendSuccess(res, null, 'OAuth configuration updated');
}));
```

---

### 9. 安全设置路由 (`server/src/routes/security.ts`)

#### 启用 2FA

```typescript
import { wsService } from '../service/websocket';

router.post('/2fa/enable', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  await SecurityOperations.enable2FA(req.user!.userId, req.body);
  
  // 推送 WebSocket 消息给当前用户
  wsService.sendToClient(req.user!.userId, {
    type: '2fa_enabled',
    data: {
      userId: req.user!.userId,
      timestamp: new Date().toISOString(),
    },
  });
  
  sendSuccess(res, null, '2FA enabled successfully');
}));
```

#### 登出会话

```typescript
router.delete('/sessions/:sessionId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId;
  await SecurityOperations.logoutSession(sessionId);
  
  // 推送 WebSocket 消息
  wsService.sendToClient(req.user!.userId, {
    type: 'session_logout',
    data: {
      sessionId: sessionId,
      userId: req.user!.userId,
    },
  });
  
  sendSuccess(res, null, 'Session logged out');
}));
```

---

## 🎯 推送策略

### 1. 全员广播 (`wsService.broadcast`)

适用于所有用户都需要知道的变化：
- 域名变更
- 账号变更
- DNS 记录变更
- 系统配置变更

### 2. 角色广播 (`wsService.broadcastToRole`)

适用于特定角色的用户：
- 审计日志 → 管理员 (role='3')
- Token 创建 → 管理员

### 3. 单用户推送 (`wsService.sendToClient`)

适用于个人操作：
- 个人设置更新
- 安全设置变更
- 会话管理

---

## ⚠️ 注意事项

### 1. 错误处理

WebSocket 推送失败不应影响主业务流程：

```typescript
try {
  wsService.broadcast({ type: 'domain_created', data: {...} });
} catch (error) {
  log.error('Domains', 'Failed to broadcast WebSocket message', { error });
  // 不抛出错误，继续执行
}
```

### 2. 性能考虑

- 避免在高频操作中推送（如批量导入）
- 可以考虑合并多个变化为一条消息
- 使用 `sendToClient` 而非 `broadcast` 当只有特定用户需要知道时

### 3. 数据最小化

只推送必要的信息，避免泄露敏感数据：

```typescript
// ❌ 不好 - 推送了太多信息
wsService.broadcast({
  type: 'user_created',
  data: newUser, // 包含密码哈希等敏感信息
});

// ✅ 好 - 只推送必要信息
wsService.broadcast({
  type: 'user_created',
  data: {
    userId: newUser.id,
    username: newUser.username,
    role: newUser.role,
  },
});
```

---

## 🧪 测试方法

### 1. 浏览器控制台测试

```javascript
// 打开两个浏览器窗口，登录不同用户
// 在一个窗口进行操作，观察另一个窗口是否收到更新

const ws = new WebSocket('ws://localhost:3001/ws?token=YOUR_TOKEN');
ws.onmessage = (event) => {
  console.log('Received:', JSON.parse(event.data));
};
```

### 2. 后端日志检查

```
[INFO] WSService - WebSocket client connected { userId: 1, role: '3', totalClients: 2 }
[INFO] Domains - Domain created and broadcasted { domainId: 123 }
[INFO] WSService - Broadcasted message to 2 clients { type: 'domain_created' }
```

---

## 📝 实施优先级

### 高优先级（立即实施）
1. ✅ 域名 CRUD
2. ✅ DNS 记录 CRUD
3. ✅ 账号 CRUD

### 中优先级（近期实施）
4. 用户 CRUD
5. 团队管理
6. Token 管理

### 低优先级（可选）
7. 审计日志自动推送
8. 系统配置更新
9. 安全设置变更

---

## 🎉 总结

WebSocket 推送的实现步骤：

1. ✅ **初始化服务** - 在 `app.ts` 中完成
2. ⏳ **添加推送代码** - 在各个路由中添加 `wsService.broadcast()`
3. ⏳ **测试验证** - 确保消息正确推送
4. ⏳ **监控优化** - 观察性能，必要时优化

现在可以开始在各个路由中添加推送逻辑了！🚀
