# DNSMgr 架构概览

## 项目概述

DNSMgr 是一个现代化的 DNS 聚合管理平台，支持管理多个 DNS 服务商的域名解析记录。项目采用前后端分离架构，使用 TypeScript 全栈开发。

## 系统架构图

```
DNSMgr/
├── server/                    # 后端服务
│   └── src/
│       ├── config/           # 配置文件
│       ├── db/               # 数据库层（三层架构）
│       ├── lib/dns/          # DNS 核心逻辑
│       ├── middleware/       # Express 中间件
│       ├── routes/           # API 路由
│       ├── service/          # 业务服务
│       ├── types/            # TypeScript 类型定义
│       ├── utils/            # 工具函数
│       └── app.ts            # 应用入口
└── client/                   # 前端应用
    └── src/
        ├── api/              # API 客户端
        ├── assets/           # 静态资源
        ├── components/       # UI 组件
        ├── contexts/         # React Context
        ├── hooks/            # 自定义 Hooks
        ├── i18n/             # 国际化
        ├── pages/            # 页面组件
        ├── styles/           # 样式文件
        ├── utils/            # 工具函数
        ├── App.tsx           # 应用根组件
        └── main.tsx          # 应用入口
```

## 核心特性

- **多 DNS 服务商支持**：支持 18+ 个 DNS 服务商（阿里云、腾讯云、华为云、Cloudflare 等）
- **多用户与团队管理**：基于角色的权限控制（RBAC）
- **完整的 DNS 记录管理**：支持所有常见记录类型的 CRUD 操作
- **审计日志**：完整的操作审计和导出功能
- **高可用支持**：DNS 故障转移和监控
- **现代化 UI**：React 18 + TailwindCSS 响应式设计

## 技术栈

### 后端技术栈

| 技术                                     | 用途                             |
| -------------------------------------- | ------------------------------ |
| **Node.js + TypeScript**               | 运行时和开发语言                       |
| **Express.js**                         | Web 框架                         |
| **better-sqlite3 / mysql2 / pg**       | 数据库驱动（SQLite/MySQL/PostgreSQL） |
| **JWT**                                | 身份认证                           |
| **swagger-jsdoc + swagger-ui-express** | API 文档                         |

### 前端技术栈

| 技术                        | 用途       |
| ------------------------- | -------- |
| **React 18**              | UI 框架    |
| **TypeScript**            | 开发语言     |
| **Vite**                  | 构建工具     |
| **TailwindCSS v3**        | CSS 框架   |
| **React Router v6**       | 路由管理     |
| **@tanstack/react-query** | 数据请求和缓存  |
| **Axios**                 | HTTP 客户端 |
| **lucide-react**          | 图标库      |
| **react-i18next**         | 国际化      |

## 架构设计原则

1. **分层架构**：清晰的职责分离，便于维护和扩展
2. **统一认证**：所有 API 请求都经过认证中间件
3. **审计日志**：关键操作都记录审计日志
4. **错误处理**：统一的错误处理机制
5. **限流保护**：防止暴力破解和 DDoS 攻击
