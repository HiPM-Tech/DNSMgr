# API 路由架构

## 路由结构

| 路由                           | 方法                  | 功能        | 权限     |
| ---------------------------- | ------------------- | --------- | ------ |
| `/api/auth/*`                | POST/GET            | 认证相关      | 公开/已认证 |
| `/api/users/*`               | GET/POST/PUT/DELETE | 用户管理      | 管理员    |
| `/api/teams/*`               | GET/POST/PUT/DELETE | 团队管理      | 已认证    |
| `/api/accounts/*`            | GET/POST/PUT/DELETE | DNS 账号管理  | 管理员    |
| `/api/domains/*`             | GET/POST/PUT/DELETE | 域名管理      | 已认证    |
| `/api/domains/:id/records/*` | GET/POST/PUT/DELETE | 解析记录管理    | 已认证    |
| `/api/audit/*`               | GET                 | 审计日志      | 管理员    |
| `/api/system/*`              | GET/POST            | 系统管理      | 超级管理员  |
| `/api/settings/*`            | GET/PUT             | 系统设置      | 管理员    |
| `/api/security/*`            | GET/POST            | 安全设置      | 已认证    |
| `/api/tokens/*`              | GET/POST/DELETE     | API Token | 已认证    |
| `/api/tunnels/*`             | GET/POST/DELETE     | 隧道管理      | 管理员    |
| `/api/init/*`                | POST                | 初始化       | 公开     |

## 认证路由 (`/api/auth`)

### 公开端点

- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册（如开启）
- `GET /api/auth/oauth/status` - 获取 OAuth 状态
- `POST /api/auth/oauth/start` - 开始 OAuth 流程
- `POST /api/auth/oauth/callback` - OAuth 回调
- `POST /api/auth/webauthn/login/start` - WebAuthn 登录开始
- `POST /api/auth/webauthn/login/finish` - WebAuthn 登录完成

### 需要认证

- `GET /api/auth/me` - 获取当前用户信息
- `POST /api/auth/logout` - 用户登出
- `POST /api/auth/password` - 修改密码
- `POST /api/auth/2fa/setup` - 设置 2FA
- `POST /api/auth/2fa/verify` - 验证 2FA
- `POST /api/auth/2fa/disable` - 禁用 2FA
- `POST /api/auth/webauthn/register/start` - 注册 Passkey 开始
- `POST /api/auth/webauthn/register/finish` - 注册 Passkey 完成
- `DELETE /api/auth/webauthn/:id` - 删除 Passkey
- `GET /api/auth/sessions` - 获取会话列表
- `DELETE /api/auth/sessions/:id` - 注销指定会话
- `DELETE /api/auth/sessions/others` - 注销其他会话

## 用户管理路由 (`/api/users`)

- `GET /api/users` - 获取用户列表（管理员）
- `POST /api/users` - 创建用户（管理员）
- `GET /api/users/:id` - 获取用户详情（管理员）
- `PUT /api/users/:id` - 更新用户（管理员）
- `DELETE /api/users/:id` - 删除用户（管理员）

## 团队管理路由 (`/api/teams`)

- `GET /api/teams` - 获取团队列表
- `POST /api/teams` - 创建团队
- `GET /api/teams/:id` - 获取团队详情
- `PUT /api/teams/:id` - 更新团队
- `DELETE /api/teams/:id` - 删除团队
- `GET /api/teams/:id/members` - 获取团队成员
- `POST /api/teams/:id/members` - 添加成员
- `DELETE /api/teams/:id/members/:userId` - 移除成员
- `GET /api/teams/:id/permissions` - 获取域名权限
- `POST /api/teams/:id/permissions` - 添加域名权限
- `DELETE /api/teams/:id/permissions/:permissionId` - 移除域名权限

## DNS 账号路由 (`/api/accounts`)

- `GET /api/accounts` - 获取账号列表
- `POST /api/accounts` - 创建账号
- `GET /api/accounts/:id` - 获取账号详情
- `PUT /api/accounts/:id` - 更新账号
- `DELETE /api/accounts/:id` - 删除账号
- `POST /api/accounts/:id/sync` - 同步域名

## 域名路由 (`/api/domains`)

- `GET /api/domains` - 获取域名列表
- `POST /api/domains` - 添加域名
- `GET /api/domains/:id` - 获取域名详情
- `PUT /api/domains/:id` - 更新域名
- `DELETE /api/domains/:id` - 删除域名
- `GET /api/domains/:id/records` - 获取解析记录列表
- `POST /api/domains/:id/records` - 添加解析记录
- `GET /api/domains/:id/records/:recordId` - 获取解析记录详情
- `PUT /api/domains/:id/records/:recordId` - 更新解析记录
- `DELETE /api/domains/:id/records/:recordId` - 删除解析记录
- `PATCH /api/domains/:id/records/:recordId/status` - 切换记录状态
- `GET /api/domains/:id/failover` - 获取故障转移配置
- `POST /api/domains/:id/failover` - 设置故障转移配置
- `DELETE /api/domains/:id/failover` - 删除故障转移配置

## 审计日志路由 (`/api/audit`)

- `GET /api/audit/logs` - 获取审计日志列表
- `GET /api/audit/logs/:id` - 获取审计日志详情
- `GET /api/audit/export` - 导出审计日志

## 系统管理路由 (`/api/system`)

- `GET /api/system/status` - 获取系统状态
- `GET /api/system/database` - 获取数据库信息
- `POST /api/system/backup` - 创建数据库备份
- `POST /api/system/clear-cache` - 清除缓存
- `GET /api/system/login-stats` - 获取登录统计
- `POST /api/system/unlock-account` - 手动解锁账户

## 设置路由 (`/api/settings`)

- `GET /api/settings` - 获取系统设置
- `PUT /api/settings` - 更新系统设置
- `GET /api/settings/smtp` - 获取 SMTP 配置
- `PUT /api/settings/smtp` - 更新 SMTP 配置
- `POST /api/settings/smtp/test` - 测试 SMTP 连接
- `GET /api/settings/oauth` - 获取 OAuth 配置
- `PUT /api/settings/oauth` - 更新 OAuth 配置
- `GET /api/settings/security` - 获取安全设置
- `PUT /api/settings/security` - 更新安全设置
- `GET /api/settings/notifications` - 获取通知配置
- `PUT /api/settings/notifications` - 更新通知配置
- `GET /api/settings/audit-rules` - 获取审计规则
- `PUT /api/settings/audit-rules` - 更新审计规则

## 安全路由 (`/api/security`)

- `GET /api/security/profile` - 获取个人资料
- `PUT /api/security/profile` - 更新个人资料
- `POST /api/security/email-code` - 发送邮箱验证码
- `POST /api/security/bind-oauth` - 绑定 OAuth 账号
- `DELETE /api/security/bind-oauth/:provider` - 解绑 OAuth 账号

## API Token 路由 (`/api/tokens`)

- `GET /api/tokens` - 获取 Token 列表
- `POST /api/tokens` - 创建 Token
- `DELETE /api/tokens/:id` - 删除 Token
- `PATCH /api/tokens/:id/status` - 更新 Token 状态

## 隧道路由 (`/api/tunnels`)

- `GET /api/tunnels` - 获取隧道列表
- `POST /api/tunnels` - 添加隧道
- `GET /api/tunnels/:id` - 获取隧道详情
- `PUT /api/tunnels/:id` - 更新隧道
- `DELETE /api/tunnels/:id` - 删除隧道

## 初始化路由 (`/api/init`)

- `GET /api/init/status` - 获取初始化状态
- `POST /api/init/test-db` - 测试数据库连接
- `POST /api/init/database` - 初始化数据库
- `POST /api/init/admin` - 创建管理员账户

## 数据库调用规范

### ✅ 正确用法

```typescript
import { query, get, execute, insert, UserOperations } from '../db';

const user = await get<User>('SELECT * FROM users WHERE id = ?', [userId]);
const users = await query<User>('SELECT * FROM users WHERE status = ?', ['active']);
const id = await insert('INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);
```

### ❌ 错误用法

```typescript
// 禁止直接使用兼容层
import { getAdapter } from '../db/adapter';  // 已废除
const db = getAdapter();
```
