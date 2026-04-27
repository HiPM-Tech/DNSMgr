# 审计日志增强 - Token 认证与用户标识

## 概述

为了更清晰地追踪操作来源，审计日志系统已增强，能够区分：
1. **JWT Token 认证**（前端页面登录）
2. **API Token 认证**（外部适配器如 ddns-go、certd）
3. **团队授权操作**（普通用户通过团队权限操作）

## 实现方案

### 1. 审计日志函数增强

**文件**: `server/src/service/audit.ts`

```typescript
export async function logAuditOperation(
  userId: number,
  action: string,
  domain: string,
  data: unknown,
  req?: Request  // 新增参数，用于检测认证方式
): Promise<void> {
  let authSource = 'jwt';  // jwt, token
  let operatorName = '';
  
  // 检测是否为 Token 认证
  const tokenPayload = (req as any)?.tokenPayload;
  if (tokenPayload) {
    authSource = 'token';
  }
  
  // 获取实际用户信息
  const user = await UserOperations.getById(userId);
  operatorName = user?.nickname || user?.username || `user:${userId}`;
  
  // 构建审计数据
  const auditData = {
    ...(data as object),
    _auth_source: authSource,      // 认证来源
    _operator_name: operatorName,  // 操作者名称
    _operator_id: actualUserId,    // 操作者 ID
  };
  
  await AuditLogOperations.log(actualUserId, action, domain, JSON.stringify(auditData));
}
```

### 2. 认证来源标识

| 认证方式 | `_auth_source` | 说明 |
|---------|---------------|------|
| JWT Token | `jwt` | 前端页面登录，使用用户名密码 + 2FA |
| API Token | `token` | 外部适配器，使用 Bearer Token |

### 3. 操作者名称记录

无论何种认证方式，都会记录**实际用户的名称**：
- 优先使用 `nickname`（昵称）
- 其次使用 `username`（用户名）
- 最后使用 `user:{id}` 格式

**示例**：
```json
{
  "_auth_source": "token",
  "_operator_name": "张三",
  "_operator_id": 5
}
```

## 使用场景

### 场景 1：前端页面操作（JWT）

```typescript
// 用户在浏览器中登录，操作域名
await logAuditOperation(req.user!.userId, 'add_domain', 'example.com', { accountId: 1 }, req);

// 审计日志
{
  "action": "add_domain",
  "domain": "example.com",
  "_auth_source": "jwt",
  "_operator_name": "管理员",
  "_operator_id": 1
}
```

### 场景 2：ddns-go 更新 DNS（API Token）

```typescript
// ddns-go 使用 API Token 调用
await logAuditOperation(req.user!.userId, 'update_record', 'example.com', { recordId: '123' }, req);

// 审计日志
{
  "action": "update_record",
  "domain": "example.com",
  "_auth_source": "token",
  "_operator_name": "张三",     // Token 关联的用户
  "_operator_id": 5
}
```

### 场景 3：团队成员操作

```typescript
// 普通用户通过团队权限操作
await logAuditOperation(req.user!.userId, 'delete_record', 'example.com', { recordId: '456' }, req);

// 审计日志
{
  "action": "delete_record",
  "domain": "example.com",
  "_auth_source": "jwt",
  "_operator_name": "李四",     // 实际操作的用户
  "_operator_id": 8
}
```

## 审计日志查询

### 查看所有 Token 操作

```sql
SELECT * FROM audit_logs 
WHERE JSON_EXTRACT(data, '$._auth_source') = 'token';
```

### 查看特定用户的操作

```sql
SELECT * FROM audit_logs 
WHERE JSON_EXTRACT(data, '$._operator_name') = '张三';
```

### 查看团队授权的操作

```sql
-- 团队授权的操作会记录实际操作者的名字
SELECT * FROM audit_logs 
WHERE JSON_EXTRACT(data, '$._auth_source') = 'jwt'
  AND JSON_EXTRACT(data, '$._operator_id') != created_by;
```

## 优势

1. **清晰溯源**：可以明确区分是人工操作还是自动化脚本
2. **责任明确**：即使使用 Token，也能追溯到具体用户
3. **团队透明**：团队成员的操作会记录实际操作者，而非团队所有者
4. **安全审计**：便于发现异常操作（如大量 Token 操作）

## 注意事项

1. **向后兼容**：未传入 `req` 参数的旧代码仍能正常工作，但无法区分认证来源
2. **性能影响**：每次审计日志会额外查询一次用户信息，但使用了数据库缓存
3. **隐私保护**：操作者名称仅记录昵称或用户名，不包含敏感信息

## 相关文件

- `server/src/service/audit.ts` - 审计日志核心逻辑
- `server/src/middleware/auth.ts` - 认证中间件（设置 tokenPayload）
- `server/src/routes/domains.ts` - 域名路由（已更新）
- `server/src/routes/records.ts` - 解析记录路由（已更新）
- `server/src/routes/settings.ts` - 系统设置路由（已更新）
- `server/src/routes/teams.ts` - 团队管理路由（待更新）
