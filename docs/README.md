# DNSMgr 文档中心

欢迎来到 DNSMgr 文档中心！这里包含了项目的完整技术文档和开发指南。

## 📚 文档结构

### 📖 项目概述
- [项目介绍](README.md) - 项目基本信息和功能特性
- [中文介绍](README_zh.md) - 中文版项目介绍
- [项目理念](PHILOSOPHY.md) - 设计理念和开发哲学

### 🏗️ 架构文档
- [架构概览](architecture/overview.md) - 系统整体架构
- [业务适配器层](architecture/business-adapter.md) - 核心数据访问层（SQL 集中管理）
- [数据库层架构](architecture/database-layer.md) - 三层数据库架构
- [DNS 核心层](architecture/dns-core.md) - DNS 服务商适配器架构
- [认证与授权](architecture/authentication.md) - 安全认证体系
- [API 路由](architecture/api-routes.md) - RESTful API 设计
- [API Token (SOK)](architecture/api-token.md) - API 访问令牌系统

### 🔄 流程文档
- [用户认证流程](flow/authentication-flow.md) - 登录认证完整流程
- [OAuth 登录流程](flow/oauth-flow.md) - OAuth 登录完整流程
- [OAuth 绑定流程](flow/oauth-bind-flow.md) - OAuth 账号绑定流程
- [DNS 记录管理流程](flow/dns-record-flow.md) - 记录操作业务流程

### 🚀 开发指南
- [快速开始](development/quick-start.md) - 环境搭建和开发流程

## 🎯 项目特点

DNSMgr 是一个现代化的 DNS 聚合管理平台，具有以下特点：

- **18+ DNS 服务商支持**：阿里云、腾讯云、华为云、Cloudflare 等
- **三层数据库架构**：业务适配器层 → 数据库抽象层 → 驱动层
- **SQL 集中管理**：所有 SQL 语句集成在业务适配器层
- **多数据库支持**：SQLite、MySQL、PostgreSQL
- **完整的权限系统**：RBAC 角色权限 + 域名级权限控制
- **审计日志**：完整的操作审计和导出功能
- **高可用支持**：DNS 故障转移和监控

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
1. SQL 语句集中管理，便于维护和优化
2. 业务代码禁止直接编写 SQL
3. 自动日志记录和性能监控
4. 类型安全的 TypeScript 支持

### 三层数据库架构

```
路由/Service层 → 业务适配器层 → 数据库抽象层 → 驱动层 → 数据库
```

- **业务适配器层**：封装所有业务 SQL 操作
- **数据库抽象层**：统一连接管理和类型定义
- **驱动层**：MySQL/PostgreSQL/SQLite 具体实现

## 🔗 相关链接

- [GitHub 仓库](https://github.com/HiPM-Tech/DNSMgr)
- [问题反馈](https://github.com/HiPM-Tech/DNSMgr/issues)
- [MIT 协议](../LICENSE)

---

*最后更新：2025年1月*
