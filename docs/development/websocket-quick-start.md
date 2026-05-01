# WebSocket 后端推送 - 快速实施清单

## ✅ 已完成
- [x] WebSocket 服务初始化 (app.ts)
- [x] 前端实时数据 Hook (useRealtimeData.ts)
- [x] 前端页面集成（11个页面）

---

## 📋 待实施的后端推送

### 🔴 高优先级（核心功能）

#### 1. 域名路由 (`server/src/routes/domains.ts`)

**需要添加的位置：**

```typescript
// 在文件顶部添加导入
import { wsService } from '../service/websocket';

// POST / - 创建域名 (约第 XXX 行)
router.post('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // ... 现有代码 ...
  const newDomain = await DomainOperations.create({...});
  
  // ✅ 添加以下代码
  wsService.broadcast({
    type: 'domain_created',
    data: { domainId: newDomain.id, name: newDomain.name },
  });
  
  sendSuccess(res, newDomain);
}));

// PUT /:id - 更新域名 (约第 XXX 行)
router.put('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // ... 现有代码 ...
  const updatedDomain = await DomainOperations.update(id, req.body);
  
  // ✅ 添加以下代码
  wsService.broadcast({
    type: 'domain_updated',
    data: { domainId: updatedDomain.id, name: updatedDomain.name },
  });
  
  sendSuccess(res, updatedDomain);
}));

// DELETE /:id - 删除域名 (约第 XXX 行)
router.delete('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // ... 现有代码 ...
  const domain = await DomainOperations.getById(id);
  await DomainOperations.delete(id);
  
  // ✅ 添加以下代码
  wsService.broadcast({
    type: 'domain_deleted',
    data: { domainId: id, name: domain?.name },
  });
  
  sendSuccess(res, null, 'Domain deleted');
}));
```

---

#### 2. 账号路由 (`server/src/routes/accounts.ts`)

```typescript
// 在文件顶部添加导入
import { wsService } from '../service/websocket';

// POST / - 创建账号
router.post('/', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  // ... 现有代码 ...
  const newAccount = await AccountOperations.create(req.body);
  
  // ✅ 添加以下代码
  wsService.broadcast({
    type: 'account_created',
    data: { accountId: newAccount.id, name: newAccount.name, type: newAccount.type },
  });
  
  sendSuccess(res, newAccount);
}));

// PUT /:id - 更新账号
router.put('/:id', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  // ... 现有代码 ...
  const updatedAccount = await AccountOperations.update(id, req.body);
  
  // ✅ 添加以下代码
  wsService.broadcast({
    type: 'account_updated',
    data: { accountId: updatedAccount.id, name: updatedAccount.name },
  });
  
  sendSuccess(res, updatedAccount);
}));

// DELETE /:id - 删除账号
router.delete('/:id', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  // ... 现有代码 ...
  const account = await AccountOperations.getById(id);
  await AccountOperations.delete(id);
  
  // ✅ 添加以下代码
  wsService.broadcast({
    type: 'account_deleted',
    data: { accountId: id, name: account?.name },
  });
  
  sendSuccess(res, null, 'Account deleted');
}));
```

---

#### 3. DNS 记录路由 (`server/src/routes/records.ts`)

```typescript
// 在文件顶部添加导入
import { wsService } from '../service/websocket';

// POST /:domainId/records - 创建记录
router.post('/:domainId/records', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // ... 现有代码 ...
  const newRecord = await RecordOperations.create(domainId, req.body);
  
  // ✅ 添加以下代码
  wsService.broadcast({
    type: 'record_created',
    data: { recordId: newRecord.id, domainId, host: newRecord.host, type: newRecord.type },
  });
  
  sendSuccess(res, newRecord);
}));

// PUT /:domainId/records/:recordId - 更新记录
router.put('/:domainId/records/:recordId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // ... 现有代码 ...
  const updatedRecord = await RecordOperations.update(domainId, recordId, req.body);
  
  // ✅ 添加以下代码
  wsService.broadcast({
    type: 'record_updated',
    data: { recordId: updatedRecord.id, domainId },
  });
  
  sendSuccess(res, updatedRecord);
}));

// DELETE /:domainId/records/:recordId - 删除记录
router.delete('/:domainId/records/:recordId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // ... 现有代码 ...
  await RecordOperations.delete(domainId, recordId);
  
  // ✅ 添加以下代码
  wsService.broadcast({
    type: 'record_deleted',
    data: { recordId, domainId },
  });
  
  sendSuccess(res, null, 'Record deleted');
}));

// PATCH /:domainId/records/:recordId/status - 更新状态
router.patch('/:domainId/records/:recordId/status', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // ... 现有代码 ...
  const updatedRecord = await RecordOperations.setStatus(domainId, recordId, status);
  
  // ✅ 添加以下代码
  wsService.broadcast({
    type: 'record_status_changed',
    data: { recordId, domainId, status: updatedRecord.status },
  });
  
  sendSuccess(res, updatedRecord);
}));
```

---

### 🟡 中优先级（重要功能）

#### 4. 用户路由 (`server/src/routes/users.ts`)

```typescript
import { wsService } from '../service/websocket';

// POST / - 创建用户
wsService.broadcast({
  type: 'user_created',
  data: { userId: newUser.id, username: newUser.username, role: newUser.role },
});

// PUT /:id - 更新用户
wsService.broadcast({
  type: 'user_updated',
  data: { userId: updatedUser.id, username: updatedUser.username },
});

// DELETE /:id - 删除用户
wsService.broadcast({
  type: 'user_deleted',
  data: { userId: id, username: user?.username },
});
```

---

#### 5. 团队路由 (`server/src/routes/teams.ts`)

```typescript
import { wsService } from '../service/websocket';

// POST / - 创建团队
wsService.broadcast({
  type: 'team_created',
  data: { teamId: newTeam.id, name: newTeam.name },
});

// POST /:id/members - 添加成员
wsService.broadcast({
  type: 'team_member_added',
  data: { teamId, userId, role },
});

// DELETE /:teamId/members/:userId - 移除成员
wsService.broadcast({
  type: 'team_member_removed',
  data: { teamId, userId },
});
```

---

#### 6. Token 路由 (`server/src/routes/tokens.ts`)

```typescript
import { wsService } from '../service/websocket';

// POST / - 创建 Token
wsService.sendToClient(req.user!.userId, {
  type: 'token_created',
  data: { tokenId: newToken.id, name: newToken.name },
});

// DELETE /:id - 撤销 Token
wsService.broadcast({
  type: 'token_revoked',
  data: { tokenId: id, userId: token?.user_id },
});
```

---

### 🟢 低优先级（可选功能）

#### 7. 审计日志 (`server/src/service/audit.ts`)

在 `logAuditOperation` 函数中添加：

```typescript
import { wsService } from './websocket';

// 在函数末尾添加
wsService.broadcastToRole('3', {
  type: 'audit_log_created',
  data: { action, domain, timestamp: new Date().toISOString() },
});
```

---

#### 8. 系统设置 (`server/src/routes/settings.ts`)

```typescript
import { wsService } from '../service/websocket';

// PUT /smtp - 更新 SMTP
wsService.broadcast({
  type: 'smtp_updated',
  data: { updatedBy: req.user!.userId, timestamp: new Date().toISOString() },
});

// PUT /oauth - 更新 OAuth
wsService.broadcast({
  type: 'oauth_updated',
  data: { updatedBy: req.user!.userId, timestamp: new Date().toISOString() },
});
```

---

#### 9. 安全设置 (`server/src/routes/security.ts`)

```typescript
import { wsService } from '../service/websocket';

// POST /2fa/enable - 启用 2FA
wsService.sendToClient(req.user!.userId, {
  type: '2fa_enabled',
  data: { userId: req.user!.userId, timestamp: new Date().toISOString() },
});

// DELETE /sessions/:sessionId - 登出会话
wsService.sendToClient(req.user!.userId, {
  type: 'session_logout',
  data: { sessionId, userId: req.user!.userId },
});
```

---

## 🎯 实施步骤

### Step 1: 实施高优先级（立即）

```bash
# 1. 编辑域名路由
code server/src/routes/domains.ts
# 在 POST, PUT, DELETE 方法中添加 wsService.broadcast()

# 2. 编辑账号路由
code server/src/routes/accounts.ts
# 在 POST, PUT, DELETE 方法中添加 wsService.broadcast()

# 3. 编辑记录路由
code server/src/routes/records.ts
# 在 POST, PUT, DELETE, PATCH 方法中添加 wsService.broadcast()
```

### Step 2: 测试验证

```bash
# 重启服务器
cd server
npm run dev

# 打开两个浏览器窗口
# 窗口1: 登录管理员账号
# 窗口2: 登录普通用户账号

# 在窗口1中操作（如添加域名）
# 观察窗口2是否自动刷新
```

### Step 3: 实施中优先级（本周内）

```bash
# 4. 用户路由
code server/src/routes/users.ts

# 5. 团队路由
code server/src/routes/teams.ts

# 6. Token 路由
code server/src/routes/tokens.ts
```

### Step 4: 实施低优先级（可选）

```bash
# 7. 审计日志
code server/src/service/audit.ts

# 8. 系统设置
code server/src/routes/settings.ts

# 9. 安全设置
code server/src/routes/security.ts
```

---

## 🧪 测试清单

### 基础测试
- [ ] WebSocket 连接成功建立
- [ ] 域名创建后其他用户立即看到
- [ ] 域名删除后其他用户立即看到
- [ ] DNS 记录变更后立即刷新
- [ ] 账号变更后立即刷新

### 降级测试
- [ ] 停止 WebSocket 服务
- [ ] 确认轮询正常工作（60秒后刷新）
- [ ] 重启 WebSocket 服务
- [ ] 确认自动重连成功

### 性能测试
- [ ] 同时 10 个用户在线
- [ ] 频繁操作（每秒 1 次）
- [ ] 检查服务器 CPU/内存使用
- [ ] 检查浏览器控制台无错误

---

## 📊 预期效果

| 操作 | 之前 | 现在 |
|------|------|------|
| 添加域名 | 其他用户需手动刷新 | ⚡ 立即显示 |
| 删除记录 | 其他用户需等待缓存过期 | ⚡ 立即消失 |
| 修改配置 | 需重新加载页面 | ⚡ 自动同步 |
| 审计日志 | 需手动刷新查看 | ⚡ 实时显示 |

---

## 💡 提示

1. **先实施高优先级的 3 个路由**，这是最核心的功能
2. **每完成一个路由就测试一次**，确保没有问题
3. **使用 try-catch 包裹 WebSocket 推送**，避免影响主业务
4. **查看后端日志**，确认消息是否正确广播

现在可以开始实施了！🚀
