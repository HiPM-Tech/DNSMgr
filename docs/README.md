# DNSMgr 文档中心

> 🚀 现代化的 DNS 聚合管理平台 | 支持 18+ DNS 服务商 | v1.3.2

<p align="center">
  <a href="api-reference.md">🔌 API 文档</a> •
  <a href="development/quick-start.md">🚀 快速开始</a> •
  <a href="architecture/overview.md">🏗️ 架构设计</a> •
  <a href="CHANGELOG.md">📋 更新日志</a>
</p>

---

## 📚 文档导航

### 📖 项目概述
- [项目概览](README.md) - 项目基本信息和功能特性
- [中文介绍](README_zh.md) - 中文版项目介绍
- [更新日志](CHANGELOG.md) - 版本更新记录

### 🔌 API 文档
- [API 参考](api-reference.md) - 完整的 RESTful API 文档
- [API Token 认证](architecture/api-token.md) - API Token 使用指南
- [错误码说明](api-error-codes.md) - 完整错误码参考

### 🚀 快速开始
- [环境搭建](development/quick-start.md) - 环境搭建和开发流程
- [Docker 部署](development/docker-deploy.md) - Docker 部署指南
- [配置指南](development/configuration.md) - 系统配置说明

### 🏗️ 架构设计
- [架构概览](architecture/overview.md) - 系统整体架构
- [业务适配器层](architecture/business-adapter.md) - 核心数据访问层（SQL 集中管理）
- [数据库层架构](architecture/database-layer.md) - 三层数据库架构
- [DNS 核心层](architecture/dns-core.md) - DNS 服务商适配器架构
- [认证与授权](architecture/authentication.md) - 安全认证体系
- [API 路由](architecture/api-routes.md) - RESTful API 设计
- [模块说明](architecture/modules.md) - 前后端模块结构

### 🔄 流程文档
- [用户认证流程](flow/authentication-flow.md) - 登录认证完整流程
- [OAuth 登录流程](flow/oauth-flow.md) - OAuth 登录完整流程
- [OAuth 绑定流程](flow/oauth-bind-flow.md) - OAuth 账号绑定流程
- [DNS 记录管理流程](flow/dns-record-flow.md) - 记录操作业务流程
- [数据库初始化流程](flow/database-init-flow.md) - 数据库初始化流程

### 🛡️ 审核与规范
- [开发规范](DEVELOPMENT.md) - 代码规范、数据库规范、开发流程
- [AI 审核团](../ai-censorship/root.md) - 代码审核标准和审查清单

---

## 🎯 项目特点

DNSMgr 是一个现代化的 DNS 聚合管理平台，具有以下特点：

| 特性 | 说明 |
|------|------|
| 🌐 **18+ DNS 服务商** | 阿里云、腾讯云、华为云、Cloudflare、GoDaddy 等 |
| 🏗️ **三层数据库架构** | 业务适配器层 → 数据库抽象层 → 驱动层 |
| 📝 **SQL 集中管理** | 所有 SQL 语句集成在业务适配器层 |
| 💾 **多数据库支持** | SQLite、MySQL、PostgreSQL |
| 🔐 **完整权限系统** | RBAC 角色权限 + 域名级权限控制 |
| 📊 **审计日志** | 完整的操作审计和导出功能 |
| 🔔 **多通知渠道** | 邮件、Webhook、Telegram、钉钉 |
| 🌍 **多语言支持** | 10+ 语言，包括 Mesugaki 风格 |
| 🔌 **完整 API** | RESTful API + API Token 认证 |
| 🛡️ **AI 审核团** | 严格的代码审核机制 |

---

## 🏛️ 架构亮点

### 业务适配器层（核心创新）

业务适配器层是 DNSMgr 的核心设计，所有 SQL 语句都集中管理在此层：

```typescript
// 业务代码只能通过 API 调用
import { UserOperations, DomainOperations } from '../db';

const user = await UserOperations.getById(1);
const domains = await DomainOperations.getByAccountId(accountId);
```

**设计原则**：
1. ✅ SQL 语句集中管理，便于维护和优化
2. ✅ 业务代码禁止直接编写 SQL
3. ✅ 自动日志记录和性能监控
4. ✅ 类型安全的 TypeScript 支持

### 三层数据库架构

```
路由/Service层 → 业务适配器层 → 数据库抽象层 → 驱动层 → 数据库
```

- **业务适配器层**：封装所有业务 SQL 操作
- **数据库抽象层**：统一连接管理和类型定义
- **驱动层**：MySQL/PostgreSQL/SQLite 具体实现

---

## 🔌 API Token 快速接入

### 1. 创建 API Token

```http
POST /api/tokens
Authorization: Bearer <user-jwt>
Content-Type: application/json

{
  "name": "CI/CD Token",
  "allowed_domains": [1, 2, 3]
}
```

### 2. 使用 Token 调用 API

```bash
curl -X GET "https://dnsmgr.example.com/api/domains" \
  -H "Authorization: Bearer dnsmgr_xxx..."
```

### 3. Python SDK 示例

```python
from dnsmgr import DNSMgrClient

client = DNSMgrClient('https://dnsmgr.example.com', 'dnsmgr_xxx...')
domains = client.get_domains()
```

👉 [查看完整 API 文档](api-reference.md)

---

## 🚀 快速部署

### Docker 一键部署

```bash
docker run -d \
  --name dnsmgr \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  ghcr.io/hipm-tech/dnsmgr:latest
```

### 开发环境

```bash
# 克隆仓库
git clone https://github.com/HiPM-Tech/DNSMgr.git
cd DNSMgr

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

👉 [查看详细部署指南](development/quick-start.md)

---

## 🌍 多语言支持

DNSMgr 支持以下语言：

| 语言 | 代码 | 状态 |
|------|------|------|
| 简体中文 | zh-CN | ✅ 完整 |
| 简体中文 (Mesugaki) | zh-CN-Mesugaki | ✅ 完整 |
| English | en | ✅ 完整 |
| 日本語 | ja | ✅ 完整 |
| 한국어 | ko | ✅ 完整 |
| Français | fr | ✅ 完整 |
| Deutsch | de | ✅ 完整 |
| Español | es | ✅ 完整 |
| Português | pt | ✅ 完整 |
| Русский | ru | ✅ 完整 |
| العربية | ar | ✅ 完整 |

---

## 📊 系统要求

| 组件 | 最低要求 | 推荐配置 |
|------|----------|----------|
| Node.js | 18.x | 20.x LTS |
| 内存 | 512MB | 1GB+ |
| 存储 | 100MB | 1GB+ |
| 数据库 | SQLite | MySQL/PostgreSQL |

---

## 🛡️ AI 审核团

DNSMgr 项目采用严格的 AI 代码审核机制，确保代码质量和项目规范：

### 审核标准

- **P0 级别**（必须修复）：数据库规范、安全漏洞、功能缺陷
- **P1 级别**（建议修复）：代码质量、性能优化、i18n 完整性
- **P2 级别**（可选优化）：代码注释、命名规范、抽象复用

### 核心要求

1. ✅ 所有数据库操作必须通过业务适配器层
2. ✅ JWT 认证使用双层密钥结构
3. ✅ 完整的日志记录（请求、响应、错误、业务操作）
4. ✅ 支持 OAuth2/OIDC 标准
5. ✅ 完整的 i18n 多语言支持

👉 [查看完整审核标准](../ai-censorship/root.md)

---

## 🔗 相关链接

- [GitHub 仓库](https://github.com/HiPM-Tech/DNSMgr)
- [问题反馈](https://github.com/HiPM-Tech/DNSMgr/issues)
- [MIT 协议](../LICENSE)

---

<p align="center">
  Made with ❤️ by HiPM Tech
</p>

*最后更新：2025年4月*
