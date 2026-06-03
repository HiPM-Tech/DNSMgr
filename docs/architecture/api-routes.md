# API 路由架构

## 路由结构

| 路由                              | 方法                  | 功能         | 权限                                         |
| ------------------------------- | ------------------- | ---------- | ------------------------------------------ |
| `/api/init/*`                   | GET/POST            | 初始化        | 公开                                         |
| `/api/auth/*`                   | POST/GET            | 认证相关       | 公开 / authMiddleware                        |
| `/api/auth/webauthn/*`          | POST/DELETE         | WebAuthn   | 公开 / authMiddleware                        |
| `/api/users/*`                  | GET/POST/PUT/DELETE | 用户管理       | authMiddleware + adminOnly                   |
| `/api/teams/*`                  | GET/POST/PUT/DELETE | 团队管理       | authMiddleware                               |
| `/api/accounts/*`               | GET/POST/PUT/DELETE | DNS 账号管理   | authMiddleware + adminOnly(管理)              |
| `/api/providers/*`              | GET                 | DNS 提供商    | authMiddleware                               |
| `/api/domains/*`                | GET/POST/PUT/DELETE | 域名管理       | authMiddleware                               |
| `/api/domains/email-templates/*` | GET/POST/PUT/DELETE | 邮件模板管理    | authMiddleware                               |
| `/api/domains/:id/records/*`    | GET/POST/PUT/DELETE | 解析记录管理     | authMiddleware                               |
| `/api/domains/:id/failover/*`   | GET/POST/PUT/DELETE | 故障转移配置     | authMiddleware                               |
| `/api/rdap/*`                   | GET                 | RDAP 查询    | 公开                                         |
| `/api/ns-monitor/*`             | GET/POST/PUT/DELETE | NS 监测      | authMiddleware                               |
| `/api/network/*`                | GET/POST            | 网络工具       | authMiddleware                               |
| `/api/audit/*`                  | GET                 | 审计日志       | authMiddleware + adminOnly + noTokenAuth     |
| `/api/system/*`                 | GET                 | 系统信息       | 公开                                         |
| `/api/settings/*`               | GET/PUT/POST        | 系统设置       | authMiddleware + noTokenAuth + adminOnly     |
| `/api/security/*`               | GET/POST            | 安全设置       | authMiddleware + noTokenAuth + adminOnly     |
| `/api/tokens/*`                 | GET/POST/PATCH/DELETE | API Token  | authMiddleware + noTokenAuth                 |
| `/api/tunnels/*`                | GET/POST/PUT/DELETE | 隧道管理       | authMiddleware                               |
| `/api/logs`                     | GET                 | 操作日志       | authMiddleware + adminOnly                   |

## 认证路由 (`/api/auth`)

### 公开端点

- `POST /api/auth/login` - 用户登录
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

需认证，管理员可管理所有账号，普通用户只能访问自己的账号。

- `GET /api/accounts/providers` - 获取可用提供商类型列表
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

需认证，仅管理员可访问（authMiddleware + adminOnly + noTokenAuth）。

- `GET /api/audit/logs` - 获取审计日志列表
- `GET /api/audit/logs/:id` - 获取审计日志详情
- `GET /api/audit/export` - 导出审计日志（支持 CSV / JSON）
- `GET /api/audit/anomalies/:userId` - 检测异常操作
- `GET /api/audit/stats/:userId` - 获取用户操作统计
- `GET /api/audit/time-distribution/:userId` - 获取操作时间分布

## RDAP 查询路由 (`/api/rdap`)

无需认证，公开查询，符合 RFC 7483 标准。

- `GET /api/rdap/domain/{domain}` - 查询域名信息
- `GET /api/rdap/nameserver/{name}` - 查询 Nameserver（预留）
- `GET /api/rdap/entity/{handle}` - 查询实体信息（预留）

## 网络路由 (`/api/network`)

需认证，代理配置管理和网络连通性检测。

- `GET /api/network/proxy` - 获取代理配置
- `POST /api/network/proxy` - 更新代理配置
- `GET /api/network/connectivity` - 测试网络连通性

## NS 监测路由 (`/api/ns-monitor`)

需认证，DNS NS 记录监测与告警。

- `GET /api/ns-monitor` - 获取用户的 NS 监测配置列表
- `POST /api/ns-monitor` - 创建 NS 监测配置
- `GET /api/ns-monitor/:id` - 获取 NS 监测配置详情
- `PUT /api/ns-monitor/:id` - 更新 NS 监测配置
- `DELETE /api/ns-monitor/:id` - 删除 NS 监测配置
- `GET /api/ns-monitor/user/prefs` - 获取用户监测偏好设置
- `PUT /api/ns-monitor/user/prefs` - 更新用户监测偏好设置
- `POST /api/ns-monitor/resolve-ns` - 解析域名的 NS 记录
- `GET /api/ns-monitor/available-domains` - 获取可供监测的域名列表
- `POST /api/ns-monitor/check` - 手动触发 NS 检查

## DNS 提供商路由 (`/api/providers`)

需认证，DNS 提供商图标和续期域名查询。

- `GET /api/providers/:type/icon` - 获取提供商图标
- `GET /api/providers/:type/renewable-domains` - 获取可续期域名列表

## 操作日志路由 (`/api/logs`)

- `GET /api/logs` - 获取操作日志列表（authMiddleware + adminOnly）

## 系统信息路由 (`/api/system`)

- `GET /api/system/info` - 获取系统信息（版本、数据库等）（公开）

## 设置路由 (`/api/settings`)

需认证，仅管理员可访问（authMiddleware + noTokenAuth + adminOnly）。

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
- `GET /api/settings/login-attempts/stats` - 获取登录尝试统计
- `POST /api/settings/login-attempts/unlock` - 手动解锁账户

## 安全路由 (`/api/security`)

需认证，个人安全设置与管理员安全策略管理。

- `GET /api/security/policy` - 获取安全策略（authMiddleware + noTokenAuth + adminOnly）
- `PUT /api/security/policy` - 更新安全策略（authMiddleware + noTokenAuth + adminOnly）
- `POST /api/security/password-strength` - 检查密码强度（公开）
- `POST /api/security/validate-password` - 验证密码是否符合策略（公开）
- `GET /api/security/requires-2fa` - 检查当前用户是否需要 2FA（authMiddleware）
- `GET /api/security/2fa-status` - 检查当前用户是否已启用 2FA（authMiddleware）
- `GET /api/security/users/:userId/require-2fa` - 获取指定用户的 2FA 要求（authMiddleware + noTokenAuth + adminOnly）
- `PUT /api/security/users/:userId/require-2fa` - 更新指定用户的 2FA 配置（authMiddleware + noTokenAuth + adminOnly）
- `POST /api/security/2fa/setup` - 设置 TOTP 2FA（authMiddleware）
- `POST /api/security/2fa/enable` - 启用 TOTP 2FA（authMiddleware）
- `POST /api/security/2fa/disable` - 禁用 TOTP 2FA（authMiddleware）
- `GET /api/security/trusted-devices` - 获取受信任设备列表（authMiddleware）
- `DELETE /api/security/trusted-devices/:deviceId` - 删除受信任设备（authMiddleware）
- `DELETE /api/security/trusted-devices` - 删除所有受信任设备（authMiddleware）
- `POST /api/security/user-require-2fa` - 设置用户是否需要 2FA（authMiddleware + noTokenAuth + adminOnly）
- `GET /api/security/profile` - 获取个人资料（authMiddleware）
- `PUT /api/security/profile` - 更新个人资料（authMiddleware）
- `POST /api/security/email-code` - 发送邮箱验证码（authMiddleware）
- `POST /api/security/bind-oauth` - 绑定 OAuth 账号（authMiddleware）
- `DELETE /api/security/bind-oauth/:provider` - 解绑 OAuth 账号（authMiddleware）

## API Token 路由 (`/api/tokens`)

需认证，禁止 API Token 访问（authMiddleware + noTokenAuth）。

- `GET /api/tokens` - 获取 Token 列表
- `POST /api/tokens` - 创建 Token
- `DELETE /api/tokens/:id` - 删除 Token
- `PATCH /api/tokens/:id/status` - 更新 Token 状态

## 隧道路由 (`/api/tunnels`)

需认证，Cloudflare 隧道管理。

- `GET /api/tunnels` - 获取隧道列表
- `POST /api/tunnels` - 添加隧道
- `GET /api/tunnels/:id` - 获取隧道详情
- `PUT /api/tunnels/:id` - 更新隧道
- `DELETE /api/tunnels/:id` - 删除隧道

## 初始化路由 (`/api/init`)

公开端点，系统首次启动时使用，不受初始化检查限制。

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
