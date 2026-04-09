# 模块说明

## 后端模块结构

```
server/src/
├── config/           # 配置文件
│   └── index.ts     # 配置导出
├── db/              # 数据库层
│   ├── index.ts     # 主入口
│   ├── business-adapter.ts    # 业务适配器层（核心）
│   ├── database.ts  # 传统数据库层（兼容）
│   ├── schema.ts    # Schema 初始化
│   ├── core/        # 数据库核心层
│   │   ├── connection.ts      # 连接管理器
│   │   ├── types.ts           # 类型定义
│   │   └── config.ts          # 配置管理
│   ├── drivers/     # 数据库驱动
│   │   ├── base.ts            # 基础驱动类
│   │   ├── mysql.ts           # MySQL 驱动
│   │   ├── postgresql.ts      # PostgreSQL 驱动
│   │   └── sqlite.ts          # SQLite 驱动
│   └── schemas/     # 数据库 Schema
│       ├── sqlite.ts          # SQLite Schema
│       ├── mysql.ts           # MySQL Schema
│       └── postgresql.ts      # PostgreSQL Schema
├── lib/             # 核心库
│   ├── dns/         # DNS 核心
│   │   ├── DnsHelper.ts       # DNS 适配器工厂
│   │   ├── DnsInterface.ts    # DNS 接口定义
│   │   ├── providerAlias.ts   # 服务商别名映射
│   │   └── providers/         # 服务商适配器
│   │       ├── index.ts       # 适配器导出
│   │       ├── registry.ts    # 服务商注册表
│   │       ├── aliyun.ts      # 阿里云
│   │       ├── cloudflare.ts  # Cloudflare
│   │       ├── dnspod.ts      # DNSPod
│   │       └── ...            # 其他服务商
│   └── logger.ts    # 日志模块
├── middleware/      # Express 中间件
│   ├── auth.ts      # 认证中间件
│   ├── initCheck.ts # 初始化检查
│   └── requestId.ts # 请求 ID
├── routes/          # API 路由
│   ├── auth.ts      # 认证路由
│   ├── users.ts     # 用户路由
│   ├── teams.ts     # 团队路由
│   ├── accounts.ts  # DNS 账号路由
│   ├── domains.ts   # 域名路由
│   ├── records.ts   # 解析记录路由
│   ├── audit.ts     # 审计路由
│   ├── system.ts    # 系统路由
│   ├── settings.ts  # 设置路由
│   ├── security.ts  # 安全路由
│   ├── tokens.ts    # API Token 路由
│   ├── tunnels.ts   # 隧道路由
│   └── init.ts      # 初始化路由
├── service/         # 业务服务
│   ├── audit.ts     # 审计服务
│   ├── loginLimit.ts # 登录限制
│   ├── totp.ts      # 2FA 服务
│   ├── webauthn.ts  # Passkeys 服务
│   ├── token.ts     # API Token 服务
│   ├── session.ts   # 会话管理
│   └── email.ts     # 邮件服务
├── types/           # TypeScript 类型
│   └── index.ts     # 类型定义
├── utils/           # 工具函数
│   ├── roles.ts     # 角色工具
│   └── index.ts     # 通用工具
└── app.ts           # 应用入口
```

## 前端模块结构

```
client/src/
├── api/             # API 客户端
│   ├── index.ts     # Axios 配置
│   ├── auth.ts      # 认证 API
│   ├── users.ts     # 用户 API
│   ├── teams.ts     # 团队 API
│   ├── accounts.ts  # DNS 账号 API
│   ├── domains.ts   # 域名 API
│   ├── records.ts   # 解析记录 API
│   ├── audit.ts     # 审计 API
│   ├── system.ts    # 系统 API
│   ├── settings.ts  # 设置 API
│   └── init.ts      # 初始化 API
├── assets/          # 静态资源
├── components/      # UI 组件
│   ├── ui/          # 基础 UI 组件
│   └── ...          # 业务组件
├── contexts/        # React Context
│   ├── AuthContext.tsx        # 认证上下文
│   └── ThemeContext.tsx       # 主题上下文
├── hooks/           # 自定义 Hooks
│   └── useAuth.ts   # 认证 Hook
├── i18n/            # 国际化
│   ├── index.ts     # i18n 配置
│   └── locales/     # 语言文件
│       ├── en.json  # 英文
│       ├── zh-CN.json # 中文
│       ├── es.json  # 西班牙语
│       └── ja.json  # 日语
├── pages/           # 页面组件
│   ├── Login.tsx    # 登录页
│   ├── Setup.tsx    # 初始化页
│   ├── Dashboard.tsx # 仪表盘
│   ├── Users.tsx    # 用户管理
│   ├── Teams.tsx    # 团队管理
│   ├── Accounts.tsx # DNS 账号
│   ├── Domains.tsx  # 域名管理
│   ├── Records.tsx  # 解析记录
│   ├── Audit.tsx    # 审计日志
│   ├── System.tsx   # 系统管理
│   └── Settings.tsx # 系统设置
├── styles/          # 样式文件
├── utils/           # 工具函数
├── App.tsx          # 应用根组件
└── main.tsx         # 应用入口
```

## 核心模块详解

### 1. 业务适配器层 (db/business-adapter.ts)

**职责**：所有数据库操作的统一入口，SQL 语句集中管理

**核心功能**：
- 提供业务操作模块（UserOperations, DomainOperations 等）
- 封装所有 SQL 语句
- 自动日志记录
- 性能监控

**使用规范**：
```typescript
// ✅ 正确 - 使用业务操作模块
import { UserOperations } from '../db';
const user = await UserOperations.getById(1);

// ❌ 错误 - 禁止直接调用底层函数
import { query } from '../db';
const user = await query('SELECT * FROM users WHERE id = ?', [1]);
```

### 2. DNS 核心模块 (lib/dns/)

**职责**：统一管理多个 DNS 服务商

**核心组件**：
- **DnsInterface.ts**: 定义 DNS 适配器接口
- **DnsHelper.ts**: 适配器工厂，根据类型创建对应适配器
- **providers/registry.ts**: 服务商注册表，管理所有服务商配置
- **providers/*.ts**: 各服务商的具体实现

**支持的 DNS 服务商**：
- 阿里云 (aliyun)
- 腾讯云 DNSPod (dnspod)
- 华为云 (huawei)
- Cloudflare (cloudflare)
- 百度云 (baidu)
- 火山引擎 (huoshan)
- 京东云 (jdcloud)
- 西部数码 (west)
- 青云 (qingcloud)
- NameSilo (namesilo)
- 宝塔 (bt)
- Spaceship (spaceship)
- PowerDNS (powerdns)
- 阿里云 ESA (aliyunesa)
- 腾讯 EdgeOne (tencenteo)
- DNS.LA (dnsla)
- DNSHE (dnshe)
- 雨云 (rainyun)

### 3. 认证模块 (middleware/auth.ts)

**职责**：处理用户认证和权限验证

**核心功能**：
- JWT Token 验证
- API Token 验证
- 双层密钥结构（JWT_SECRET + runtime_secret）
- 权限检查中间件（adminOnly, superAdminOnly）

### 4. 审计模块 (service/audit.ts)

**职责**：记录所有关键操作

**核心功能**：
- 操作日志记录
- 日志导出
- 审计规则配置

### 5. 国际化模块 (i18n/)

**职责**：多语言支持

**支持语言**：
- 英文 (en)
- 简体中文 (zh-CN)
- 西班牙语 (es)
- 日语 (ja)

## 模块依赖关系

```
┌─────────────────────────────────────────────────────────────┐
│                        前端层 (Client)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Pages   │  │Components│  │  Hooks   │  │ Contexts │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       └─────────────┴─────────────┴─────────────┘           │
│                         │                                   │
│                    ┌────┴────┐                              │
│                    │ API Client│                             │
│                    └────┬────┘                              │
└─────────────────────────┼───────────────────────────────────┘
                          │ HTTP
┌─────────────────────────┼───────────────────────────────────┐
│                        后端层 (Server)                       │
│                    ┌────┴────┐                              │
│                    │  Routes  │                              │
│                    └────┬────┘                              │
│       ┌─────────────────┼─────────────────┐                 │
│  ┌────┴────┐      ┌────┴────┐      ┌────┴────┐             │
│  │Middleware│      │ Services │      │   DNS    │             │
│  └────┬────┘      └────┬────┘      └────┬────┘             │
│       └─────────────────┼─────────────────┘                 │
│                    ┌────┴────┐                              │
│                    │Business Adapter│                        │
│                    └────┬────┘                              │
│              ┌──────────┼──────────┐                        │
│         ┌────┴────┐ ┌──┴───┐ ┌────┴────┐                   │
│         │  Core   │ │Schema│ │ Drivers │                   │
│         └────┬────┘ └──────┘ └────┬────┘                   │
│              └────────────────────┘                         │
│                         │                                   │
│                    ┌────┴────┐                              │
│                    │ Database│                               │
│                    └─────────┘                              │
└─────────────────────────────────────────────────────────────┘
```

## 开发规范

### 后端开发规范

1. **数据库访问**：必须通过业务操作模块，禁止直接编写 SQL
2. **错误处理**：统一使用 try-catch，记录错误日志
3. **类型安全**：所有函数必须声明返回类型
4. **日志规范**：使用 logger.ts 记录日志，包含上下文信息

### 前端开发规范

1. **状态管理**：使用 React Query 管理服务器状态
2. **表单处理**：使用受控组件，统一验证规则
3. **错误处理**：统一错误提示，友好用户体验
4. **国际化**：所有用户可见文本必须使用 i18n
