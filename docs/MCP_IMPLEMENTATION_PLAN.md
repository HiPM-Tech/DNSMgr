# HiDNS MCP 实现计划

**版本**：1.0  
**创建日期**：2026-05-31  
**状态**：规划阶段

---

## 📋 目录

1. [项目概述](#项目概述)
2. [核心特性](#核心特性)
3. [技术架构](#技术架构)
4. [数据库设计](#数据库设计)
5. [API 设计](#api-设计)
6. [实施计划](#实施计划)
7. [安全性考虑](#安全性考虑)
8. [测试计划](#测试计划)
9. [部署指南](#部署指南)
10. [后续优化](#后续优化)

---

## 项目概述

### 背景

HiDNS 是一个现代化的 DNS 聚合管理平台，支持 20+ DNS 提供商。为了提升用户体验和自动化能力，计划引入 MCP (Model Context Protocol) 支持，让用户可以通过 AI 助手（如 Claude Desktop）自然语言管理 DNS。

### 目标

1. **提升易用性**：通过自然语言查询和管理 DNS
2. **增强自动化**：AI 可以自动执行常见操作
3. **保持安全**：严格的认证、授权和审计机制
4. **灵活扩展**：支持多种认证方式，便于集成

### 范围

- ✅ MCP Server 实现
- ✅ API Key 认证
- ✅ OAuth2 认证
- ✅ 超管统一管理
- ✅ 完整的审计日志
- ❌ 写操作（Phase 2）
- ❌ 智能分析（Phase 3）

---

## 核心特性

### 1. 双认证模式

#### API Key 认证
- **适用场景**：脚本、CLI、自动化任务
- **特点**：简单快捷，易于配置
- **权限**：每用户独立 Key，可设置有效期
- **管理**：支持生成、撤销、轮换

#### OAuth2 认证
- **适用场景**：第三方应用、Web 集成
- **特点**：标准协议，安全可靠
- **权限**：应用级授权，可精细控制
- **管理**：支持创建应用、撤销授权

### 2. 超管统一管理

- **全局开关**：超管控制 MCP 功能启用/禁用
- **Token 有效期**：可配置 OAuth2 Token 默认有效期（1-365 天）
- **审计日志**：查看所有用户的 MCP 操作记录
- **强制撤销**：超管可以撤销任何用户的访问权限

### 3. 安全机制

- **每用户独立凭证**：避免全局 Key 泄露风险
- **权限隔离**：read/write/admin 三级权限
- **过期自动失效**：Token 和 Key 都有有效期
- **完整审计**：记录所有操作，可追溯

---

## 技术架构

### 整体架构

```
┌─────────────────────────────────────────────┐
│         AI Assistant (Claude Desktop)       │
└──────────────┬──────────────────────────────┘
               │ MCP Protocol (Stdio)
               ▼
┌─────────────────────────────────────────────┐
│         MCP Server (HiDNS)                  │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │  Authentication Layer                 │ │
│  │  - API Key 验证                       │ │
│  │  - OAuth2 Token 验证                  │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │  Authorization Layer                  │ │
│  │  - 检查 MCP 全局开关                  │ │
│  │  - 验证用户权限                       │ │
│  │  - 检查 Token/Key 有效期              │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │  Tools Implementation                 │ │
│  │  - list_domains                       │ │
│  │  - get_domain_info                    │ │
│  │  - list_dns_records                   │ │
│  │  - check_domain_status                │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │  Audit Logger                         │ │
│  │  - 记录所有操作                       │ │
│  └───────────────────────────────────────┘ │
└──────────────┬──────────────────────────────┘
               │ HTTP API
               ▼
┌─────────────────────────────────────────────┐
│         HiDNS Backend                       │
│  - /api/mcp/config                          │
│  - /api/mcp/api-keys                        │
│  - /api/mcp/oauth/*                         │
│  - /api/domains                             │
│  - /api/records                             │
└─────────────────────────────────────────────┘
```

### 技术栈

- **后端框架**：Node.js + Express + TypeScript
- **MCP SDK**：@modelcontextprotocol/sdk
- **数据库**：SQLite / MySQL / PostgreSQL
- **前端框架**：React 18 + TypeScript + TDesign
- **数据获取**：@tanstack/react-query

---

## 数据库设计

### ER 图

```
┌──────────────────────┐       ┌────────────────────────┐
│ mcp_global_config    │       │ users                  │
├──────────────────────┤       ├────────────────────────┤
│ id (PK)              │       │ id (PK)                │
│ enabled              │       │ username               │
│ oauth_token_expiry_  │       │ role                   │
│   days               │       │ ...                    │
│ max_oauth_token_     │       └────────────┬───────────┘
│   expiry_days        │                    │
│ created_by (FK) ─────┼────────────────────┘
│ created_at           │
│ updated_at           │
└──────────────────────┘

┌──────────────────────┐       ┌────────────────────────┐
│ mcp_user_api_keys    │       │ mcp_oauth_clients      │
├──────────────────────┤       ├────────────────────────┤
│ id (PK)              │       │ id (PK)                │
│ user_id (FK) ────────┼──┐    │ client_id (UK)         │
│ api_key (UK)         │  │    │ client_secret          │
│ scope                │  │    │ user_id (FK) ──────────┼──┐
│ description          │  │    │ app_name               │  │
│ last_used_at         │  │    │ redirect_uris          │  │
│ expires_at           │  │    │ scope                  │  │
│ revoked_at           │  │    │ created_at             │  │
│ created_at           │  │    │ updated_at             │  │
└──────────┬───────────┘  │    └──────────┬─────────────┘  │
           │              │               │                │
           │              │    ┌──────────┴─────────────┐  │
           │              │    │ mcp_oauth_authorization│  │
           │              │    │ _codes                 │  │
           │              │    ├────────────────────────┤  │
           │              │    │ id (PK)                │  │
           │              │    │ code (UK)              │  │
           │              │    │ client_id (FK) ────────┼──┘
           │              │    │ user_id (FK) ──────────┼──┐
           │              │    │ redirect_uri           │  │
           │              │    │ scope                  │  │
           │              │    │ expires_at             │  │
           │              │    │ used                   │  │
           │              │    │ created_at             │  │
           │              │    └──────────┬─────────────┘  │
           │              │               │                │
           │              │    ┌──────────┴─────────────┐  │
           │              │    │ mcp_oauth_access_tokens│  │
           │              │    ├────────────────────────┤  │
           │              │    │ id (PK)                │  │
           │              │    │ access_token (UK)      │  │
           │              │    │ refresh_token (UK)     │  │
           │              │    │ client_id (FK) ────────┼──┘
           │              │    │ user_id (FK) ──────────┼──┐
           │              │    │ scope                  │  │
           │              │    │ expires_at             │  │
           │              │    │ revoked_at             │  │
           │              │    │ created_at             │  │
           │              │    └──────────┬─────────────┘  │
           │              │               │                │
           │              └───────────────┘                │
           │                                               │
           └───────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │ mcp_audit_logs        │
                    ├───────────────────────┤
                    │ id (PK)               │
                    │ user_id (FK) ─────────┼──┐
                    │ auth_type             │  │
                    │ client_id             │  │
                    │ tool_name             │  │
                    │ arguments             │  │
                    │ result                │  │
                    │ ip_address            │  │
                    │ created_at            │  │
                    └───────────────────────┘  │
                                               │
                    ┌──────────────────────────┘
                    │
                    └──→ users.id
```

### 表结构详情

#### 1. mcp_global_config

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| enabled | INTEGER | 全局开关（0: 禁用, 1: 启用） |
| oauth_token_expiry_days | INTEGER | OAuth Token 默认有效期（天） |
| max_oauth_token_expiry_days | INTEGER | 最大有效期（天，固定 365） |
| created_by | INTEGER | 创建者用户 ID（FK） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

#### 2. mcp_user_api_keys

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| user_id | INTEGER | 用户 ID（FK） |
| api_key | VARCHAR(512) | API Key（唯一） |
| scope | VARCHAR(255) | 权限级别（read/write/admin） |
| description | VARCHAR(255) | 描述 |
| last_used_at | DATETIME | 最后使用时间 |
| expires_at | DATETIME | 过期时间 |
| revoked_at | DATETIME | 撤销时间 |
| created_at | DATETIME | 创建时间 |

#### 3. mcp_oauth_clients

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| client_id | VARCHAR(255) | 客户端 ID（唯一） |
| client_secret | VARCHAR(512) | 客户端密钥 |
| user_id | INTEGER | 所属用户 ID（FK） |
| app_name | VARCHAR(255) | 应用名称 |
| redirect_uris | TEXT | 重定向 URI 列表（JSON） |
| scope | VARCHAR(255) | 权限级别 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

#### 4. mcp_oauth_authorization_codes

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| code | VARCHAR(512) | 授权码（唯一） |
| client_id | VARCHAR(255) | 客户端 ID（FK） |
| user_id | INTEGER | 用户 ID（FK） |
| redirect_uri | VARCHAR(512) | 重定向 URI |
| scope | VARCHAR(255) | 权限级别 |
| expires_at | DATETIME | 过期时间（10 分钟） |
| used | INTEGER | 是否已使用（0/1） |
| created_at | DATETIME | 创建时间 |

#### 5. mcp_oauth_access_tokens

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| access_token | VARCHAR(512) | Access Token（唯一） |
| refresh_token | VARCHAR(512) | Refresh Token（唯一） |
| client_id | VARCHAR(255) | 客户端 ID（FK） |
| user_id | INTEGER | 用户 ID（FK） |
| scope | VARCHAR(255) | 权限级别 |
| expires_at | DATETIME | 过期时间 |
| revoked_at | DATETIME | 撤销时间 |
| created_at | DATETIME | 创建时间 |

#### 6. mcp_audit_logs

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| user_id | INTEGER | 用户 ID（FK） |
| auth_type | VARCHAR(20) | 认证类型（api_key/oauth2） |
| client_id | VARCHAR(255) | OAuth 客户端 ID（可选） |
| tool_name | VARCHAR(100) | 工具名称 |
| arguments | TEXT | 参数（JSON） |
| result | TEXT | 结果（JSON） |
| ip_address | VARCHAR(45) | IP 地址 |
| created_at | DATETIME | 创建时间 |

---

## API 设计

### 1. MCP 全局配置

#### GET /api/mcp/config
**权限**：Super Admin  
**描述**：获取 MCP 全局配置

**响应**：
```json
{
  "enabled": true,
  "oauth_token_expiry_days": 15,
  "max_oauth_token_expiry_days": 365
}
```

#### POST /api/mcp/config
**权限**：Super Admin  
**描述**：更新 MCP 全局配置

**请求体**：
```json
{
  "enabled": true,
  "oauth_token_expiry_days": 30
}
```

**响应**：
```json
{
  "success": true
}
```

#### GET /api/mcp/status
**权限**：公开  
**描述**：检查 MCP 是否启用

**响应**：
```json
{
  "enabled": true
}
```

---

### 2. API Key 管理

#### GET /api/mcp/api-keys
**权限**：Authenticated  
**描述**：获取当前用户的 API Keys

**响应**：
```json
{
  "api_keys": [
    {
      "id": 1,
      "api_key": "hidns_mcp_abc123...",
      "scope": "read",
      "description": "My CLI tool",
      "last_used_at": "2026-05-31T10:00:00Z",
      "expires_at": "2027-05-31T00:00:00Z",
      "revoked_at": null,
      "created_at": "2026-05-31T09:00:00Z"
    }
  ]
}
```

#### POST /api/mcp/api-keys
**权限**：Authenticated  
**描述**：生成新的 API Key

**请求体**：
```json
{
  "scope": "read",
  "description": "My automation script",
  "expires_in_days": 365
}
```

**响应**：
```json
{
  "success": true,
  "api_key": "hidns_mcp_xyz789...",
  "message": "API key generated successfully"
}
```

#### POST /api/mcp/api-keys/:id/rotate
**权限**：Authenticated  
**描述**：轮换 API Key

**响应**：
```json
{
  "success": true,
  "api_key": "hidns_mcp_new123...",
  "message": "API key rotated successfully"
}
```

#### DELETE /api/mcp/api-keys/:id
**权限**：Authenticated  
**描述**：撤销 API Key

**响应**：
```json
{
  "success": true,
  "message": "API key revoked"
}
```

---

### 3. OAuth2 管理

#### GET /api/mcp/oauth/clients
**权限**：Authenticated  
**描述**：获取当前用户的 OAuth 客户端应用

**响应**：
```json
{
  "clients": [
    {
      "id": 1,
      "client_id": "hidns_mcp_abc123",
      "app_name": "My Web App",
      "redirect_uris": ["https://example.com/callback"],
      "scope": "read",
      "created_at": "2026-05-31T09:00:00Z",
      "updated_at": "2026-05-31T09:00:00Z"
    }
  ]
}
```

#### POST /api/mcp/oauth/clients
**权限**：Authenticated  
**描述**：创建 OAuth 客户端应用

**请求体**：
```json
{
  "app_name": "My Web App",
  "redirect_uris": ["https://example.com/callback"],
  "scope": "read"
}
```

**响应**：
```json
{
  "success": true,
  "client_id": "hidns_mcp_abc123",
  "client_secret": "secret_xyz789",
  "message": "OAuth client created successfully"
}
```

#### DELETE /api/mcp/oauth/clients/:id
**权限**：Authenticated  
**描述**：删除 OAuth 客户端应用

**响应**：
```json
{
  "success": true,
  "message": "OAuth client deleted"
}
```

#### GET /api/mcp/oauth/authorize
**权限**：Authenticated  
**描述**：OAuth2 授权页面

**查询参数**：
- `client_id`: 客户端 ID
- `redirect_uri`: 重定向 URI
- `scope`: 权限范围
- `state`: 状态参数

#### POST /api/mcp/oauth/authorize
**权限**：Authenticated  
**描述**：处理授权确认

**请求体**：
```
client_id=xxx&redirect_uri=xxx&scope=read&state=xxx&action=allow
```

#### POST /api/mcp/oauth/token
**权限**：公开  
**描述**：交换授权码为 Access Token

**请求体**：
```
grant_type=authorization_code&code=xxx&client_id=xxx&client_secret=xxx&redirect_uri=xxx
```

**响应**：
```json
{
  "access_token": "token_abc123",
  "token_type": "Bearer",
  "expires_in": 1296000,
  "refresh_token": "refresh_xyz789",
  "scope": "read"
}
```

#### POST /api/mcp/oauth/revoke
**权限**：Authenticated  
**描述**：撤销 Token

**请求体**：
```json
{
  "token": "token_abc123",
  "token_type_hint": "access_token"
}
```

**响应**：
```json
{
  "success": true
}
```

---

### 4. 审计日志

#### GET /api/mcp/audit-logs
**权限**：Super Admin  
**描述**：获取审计日志

**查询参数**：
- `page`: 页码（默认 1）
- `pageSize`: 每页数量（默认 50）
- `userId`: 过滤用户 ID（可选）

**响应**：
```json
{
  "logs": [
    {
      "id": 1,
      "user_id": 1,
      "auth_type": "api_key",
      "client_id": null,
      "tool_name": "list_domains",
      "arguments": "{\"keyword\":\"example\"}",
      "result": "{...}",
      "ip_address": "192.168.1.1",
      "created_at": "2026-05-31T10:00:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "pageSize": 50
}
```

---

## 实施计划

### Phase 1：基础架构（Week 1）

#### Day 1-2：数据库设计与迁移
- [ ] 创建数据库 Schema
- [ ] 编写迁移脚本
- [ ] 测试多数据库兼容性（SQLite/MySQL/PostgreSQL）

**交付物**：
- `server/src/db/migrations/mcp-initial.ts`
- 数据库表创建完成

#### Day 3-4：MCP 全局配置
- [ ] 实现 `/api/mcp/config` 路由
- [ ] 实现 `/api/mcp/status` 路由
- [ ] 添加超管权限检查

**交付物**：
- `server/src/routes/mcp-config.ts`
- API 文档

#### Day 5：MCP Server 骨架
- [ ] 安装 @modelcontextprotocol/sdk
- [ ] 创建 MCP Server 基础结构
- [ ] 实现工具注册框架

**交付物**：
- `server/src/mcp/server.ts`
- `server/package.json` 更新

---

### Phase 2：API Key 认证（Week 2）

#### Day 6-7：API Key 管理
- [ ] 实现 `/api/mcp/api-keys` 路由
- [ ] 实现生成、撤销、轮换功能
- [ ] 添加权限验证

**交付物**：
- `server/src/routes/mcp-apikeys.ts`
- API 测试用例

#### Day 8-9：MCP Server 认证集成
- [ ] 实现 API Key 验证逻辑
- [ ] 集成到 MCP Server
- [ ] 添加审计日志记录

**交付物**：
- `server/src/service/mcp-auth.ts`
- 更新的 `server/src/mcp/server.ts`

#### Day 10：前端 API Key 管理页面
- [ ] 创建 API Key 列表页面
- [ ] 实现生成、复制、撤销功能
- [ ] 添加轮换功能

**交付物**：
- `client/src/pages/MCPApiKeys.tsx`
- UI 组件

---

### Phase 3：OAuth2 认证（Week 3）

#### Day 11-12：OAuth2 客户端管理
- [ ] 实现 `/api/mcp/oauth/clients` 路由
- [ ] 实现创建、删除功能
- [ ] 添加客户端验证

**交付物**：
- `server/src/routes/mcp-oauth.ts`（部分）
- API 测试用例

#### Day 13-14：OAuth2 授权流程
- [ ] 实现授权码生成
- [ ] 实现 Token 交换
- [ ] 实现 Token 撤销
- [ ] 创建授权页面模板

**交付物**：
- `server/src/routes/mcp-oauth.ts`（完整）
- `server/views/mcp/oauth-authorize.ejs`

#### Day 15：MCP Server OAuth2 集成
- [ ] 实现 OAuth2 Token 验证
- [ ] 集成到 MCP Server
- [ ] 添加审计日志

**交付物**：
- 更新的 `server/src/mcp/server.ts`
- 更新的 `server/src/service/mcp-auth.ts`

---

### Phase 4：前端界面（Week 4）

#### Day 16-17：OAuth2 应用管理页面
- [ ] 创建应用列表页面
- [ ] 实现创建、删除功能
- [ ] 显示 Client ID 和 Secret

**交付物**：
- `client/src/pages/MCPOAuthClients.tsx`

#### Day 18-19：超管配置页面
- [ ] 创建全局配置页面
- [ ] 实现启用/禁用开关
- [ ] 实现 Token 有效期配置
- [ ] 添加审计日志查看

**交付物**：
- `client/src/pages/MCPSettings.tsx`
- `client/src/pages/MCPAuditLogs.tsx`

#### Day 20：路由集成与导航
- [ ] 添加 MCP 相关路由
- [ ] 在侧边栏添加 MCP 菜单
- [ ] 权限控制（超管可见）

**交付物**：
- 更新的 `client/src/App.tsx`
- 更新的导航组件

---

### Phase 5：测试与优化（Week 5）

#### Day 21-22：单元测试
- [ ] API Key 管理测试
- [ ] OAuth2 流程测试
- [ ] 权限验证测试

**交付物**：
- `server/tests/mcp/*.test.ts`

#### Day 23-24：集成测试
- [ ] MCP Server 端到端测试
- [ ] Claude Desktop 集成测试
- [ ] 性能测试

**交付物**：
- 测试报告
- 性能基准数据

#### Day 25：文档与部署
- [ ] 编写用户文档
- [ ] 编写开发者文档
- [ ] 准备 Docker 镜像
- [ ] 更新 CHANGELOG

**交付物**：
- `docs/mcp-user-guide.md`
- `docs/mcp-developer-guide.md`
- Docker 镜像

---

## 安全性考虑

### 1. 认证安全

- ✅ **每用户独立凭证**：避免全局 Key 泄露
- ✅ **强随机生成**：使用 crypto.randomBytes 生成 Key/Token
- ✅ **HTTPS 强制**：生产环境必须使用 HTTPS
- ✅ **Token 加密存储**：敏感信息加密存储

### 2. 授权安全

- ✅ **最小权限原则**：默认 read 权限
- ✅ **权限隔离**：不同用户无法访问彼此的资源
- ✅ **超管控制**：超管可以撤销任何访问
- ✅ **定期轮换**：建议定期轮换 API Key

### 3. 审计安全

- ✅ **完整日志**：记录所有操作
- ✅ **不可篡改**：审计日志只增不改
- ✅ **IP 记录**：记录操作来源 IP
- ✅ **实时监控**：超管可以实时查看

### 4. 防护措施

- ✅ **速率限制**：防止暴力破解
- ✅ **过期自动失效**：Token/Key 有过期时间
- ✅ **撤销立即生效**：撤销后立即拒绝访问
- ✅ **错误信息模糊**：不泄露具体错误原因

---

## 测试计划

### 单元测试

#### API Key 测试
- [ ] 生成 API Key
- [ ] 验证 API Key
- [ ] 撤销 API Key
- [ ] 轮换 API Key
- [ ] 过期检测

#### OAuth2 测试
- [ ] 创建 OAuth 客户端
- [ ] 生成授权码
- [ ] 交换 Access Token
- [ ] 刷新 Token
- [ ] 撤销 Token
- [ ] 过期检测

### 集成测试

#### MCP Server 测试
- [ ] 工具调用（API Key）
- [ ] 工具调用（OAuth2）
- [ ] 权限验证
- [ ] 审计日志记录

#### 前端测试
- [ ] API Key 管理页面
- [ ] OAuth2 应用管理页面
- [ ] 超管配置页面
- [ ] 审计日志页面

### 端到端测试

#### Claude Desktop 集成
- [ ] 配置 API Key
- [ ] 配置 OAuth2
- [ ] 调用工具
- [ ] 验证结果

---

## 部署指南

### 1. 环境变量

```bash
# MCP Server 配置
MCP_SERVER_SECRET=your-secret-key-here

# 数据库配置（已有）
DB_TYPE=sqlite
DB_PATH=./data/dnsmgr.db
```

### 2. Docker 部署

```dockerfile
# 在现有 Dockerfile 中添加
COPY server/src/mcp /app/server/src/mcp
RUN npm install @modelcontextprotocol/sdk
```

```yaml
# docker-compose.yml
services:
  hidns:
    environment:
      - MCP_SERVER_SECRET=${MCP_SERVER_SECRET}
```

### 3. 初始化步骤

1. **启动服务**
   ```bash
   docker-compose up -d
   ```

2. **超管登录**
   - 访问 `http://localhost:3000`
   - 使用超管账号登录

3. **启用 MCP**
   - 进入「系统设置」→「MCP 设置」
   - 启用 MCP 功能
   - 配置 Token 有效期

4. **用户生成凭证**
   - 用户进入→「MCP 管理」
   - 生成 API Key 或创建/管理 OAuth2 应用

5. **配置 Claude Desktop**
   - 编辑 Claude Desktop 配置文件
   - 添加 MCP Server 配置
   - 重启 Claude Desktop

---

## 后续优化

### Phase 2：写操作支持

- [ ] 实现 `add_dns_record` 工具
- [ ] 实现 `update_dns_record` 工具
- [ ] 实现 `delete_dns_record` 工具
- [ ] 添加二次确认机制
- [ ] 增强审计日志

### Phase 3：智能分析

- [ ] 实现 `analyze_dns_config` 工具
- [ ] 集成 AI 分析引擎
- [ ] 提供优化建议
- [ ] 自动生成报告

### Phase 4：高级功能

- [ ] Webhook 通知
- [ ] 批量操作
- [ ] 定时任务
- [ ] 自定义工具插件

---

## 附录

### A. 参考资料

- [MCP Specification](https://modelcontextprotocol.io/specification)
- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [Express.js Documentation](https://expressjs.com/)
- [React Query Documentation](https://tanstack.com/query/latest)

### B. 术语表

- **MCP**: Model Context Protocol
- **API Key**: API 密钥，用于简单认证
- **OAuth2**: 开放授权标准
- **Access Token**: 访问令牌
- **Refresh Token**: 刷新令牌
- **Authorization Code**: 授权码

### C. 联系方式

- **项目负责人**: [Your Name]
- **技术支持**: support@hidns.example.com
- **GitHub**: https://github.com/HiPM-Tech/HiDNS

---

**文档版本**：1.0  
**最后更新**：2026-05-31  
**审核状态**：待审核
