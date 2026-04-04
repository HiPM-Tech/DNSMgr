# DNSMgr - DNS Aggregation Management Platform

A modern DNS aggregation management platform built with React + TailwindCSS (frontend) and Node.js + TypeScript (backend).

## Features

- **Multi-provider Support**: Manage DNS records across 18 providers:
  - Aliyun (阿里云), DNSPod (腾讯云), Huawei Cloud (华为云), Baidu Cloud (百度云)
  - Volcengine (火山引擎), JD Cloud (京东云), Cloudflare, DNS.LA
  - West Digital (西部数码), Qingcloud (青云), NameSilo, BT Panel (宝塔)
  - Spaceship, PowerDNS, Aliyun ESA (阿里云 ESA), Tencent EdgeOne (腾讯 EdgeOne)
  - DNSHE, Rainyun (雨云)

- **Multi-user & Team Management**: Role-based access (admin/member), team-based domain sharing
- **Full DNS Record Management**: CRUD for all record types (A, AAAA, CNAME, MX, TXT, SRV, CAA, etc.)
- **Modern UI**: React 18 + TailwindCSS with responsive design
- **API Documentation**: Swagger UI at `/api/docs`
- **Extensible Architecture**: Abstract DNS interface makes adding new providers easy

## Architecture

```
DNSMgr/
├── server/          # Node.js + TypeScript backend
│   └── src/
│       ├── lib/dns/ # DNS provider adapters (abstract interface)
│       ├── routes/  # REST API routes
│       ├── middleware/ # Auth (JWT), validation
│       └── db/      # SQLite database
└── client/          # React + Vite + TailwindCSS frontend
    └── src/
        ├── pages/   # All UI pages
        ├── components/ # Reusable components
        └── api/     # API client
```

## Quick Start

### Prerequisites
- Node.js >= 18
- pnpm

### Install Dependencies

```bash
pnpm install
```

### Development

```bash
# Start both server and client in parallel
pnpm dev
```

Or separately:

```bash
# Backend (port 3001)
cd server && pnpm dev

# Frontend (port 5173)
cd client && pnpm dev
```

### Production Build

```bash
pnpm build
```

### Environment Variables

Copy `.env.example` to `.env` in the `server/` directory:

```bash
cp server/.env.example server/.env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `JWT_SECRET` | `dnsmgr-secret-key` | JWT signing secret (change in production!) |
| `DB_PATH` | `./dnsmgr.db` | SQLite database path |

## Default Login

On first run, a default admin account is created:

- **Username**: `admin`
- **Password**: `admin123`

⚠️ **Change this password immediately after first login!**

## API Documentation

After starting the server, visit: `http://localhost:3001/api/docs`

Provider API alignment notes:
- [provider-api-alignment.md](docs/provider-api-alignment.md)
- Includes Tencent DNSPod, Tencent EO, and Aliyun DNS official API mapping and current implementation status.

Provider docs:
- [西部数码 DNS](docs/providers/west.md)

## Record Model Notes

- DNS records still expose the generic `line` field for backward compatibility.
- For Cloudflare, use provider-specific fields in request/response payloads:
  - `cloudflare.proxied`: proxy switch (`true` = proxied, `false` = DNS only)
  - `cloudflare.proxiable`: whether the current record type can be proxied
- Write precedence for Cloudflare create/update:
  - If `cloudflare.proxied` is provided, it is used.
  - Otherwise, fallback to `line` (`'1'` = proxied, `'0'` = DNS only).

## Adding a New DNS Provider

1. Create a new adapter in `server/src/lib/dns/providers/myprovider.ts` implementing `DnsAdapter`
2. Register it in `server/src/lib/dns/DnsHelper.ts` (add to `DNS_PROVIDERS` map)
3. Export it in `server/src/lib/dns/providers/index.ts`

The adapter must implement the `DnsAdapter` interface:

```typescript
interface DnsAdapter {
  check(): Promise<boolean>;
  getDomainList(...): Promise<PageResult<DomainInfo>>;
  getDomainRecords(...): Promise<PageResult<DnsRecord>>;
  addDomainRecord(...): Promise<string | null>;
  updateDomainRecord(...): Promise<boolean>;
  deleteDomainRecord(...): Promise<boolean>;
  setDomainRecordStatus(...): Promise<boolean>;
  // ...
}
```

## Tech Stack

**Backend:**
- Node.js + TypeScript
- Express.js
- SQLite (better-sqlite3)
- JWT authentication
- Swagger/OpenAPI documentation

**Frontend:**
- React 18 + TypeScript
- Vite
- TailwindCSS v3
- React Router v6
- @tanstack/react-query
- Axios
- lucide-react

## License

MIT

---

# DNSMgr - DNS 聚合管理平台（中文说明）

一个基于 React + TailwindCSS（前端）和 Node.js + TypeScript（后端）构建的现代化 DNS 聚合管理平台。

## 功能特性

- **多服务商支持**：支持 18 家 DNS 服务商：
  - 阿里云、腾讯云(DNSPod)、华为云、百度云
  - 火山引擎、京东云、Cloudflare、DNS.LA
  - 西部数码、青云、NameSilo、宝塔面板
  - Spaceship、PowerDNS、阿里云 ESA、腾讯 EdgeOne
  - DNSHE、雨云(Rainyun)

- **多用户与团队管理**：基于角色的访问控制（管理员/成员），团队域名共享
- **完整的 DNS 记录管理**：支持所有记录类型的增删改查（A、AAAA、CNAME、MX、TXT、SRV、CAA 等）
- **现代化界面**：React 18 + TailwindCSS 响应式设计
- **API 文档**：Swagger UI 访问地址 `/api/docs`
- **可扩展架构**：抽象 DNS 接口，轻松添加新服务商

## 快速开始

### 环境要求
- Node.js >= 18
- pnpm

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
# 同时启动前后端
pnpm dev
```

或分别启动：

```bash
# 后端（端口 3001）
cd server && pnpm dev

# 前端（端口 5173）
cd client && pnpm dev
```

### 生产构建

```bash
pnpm build
```

### 环境变量

复制 `server/.env.example` 到 `server/.env`：

```bash
cp server/.env.example server/.env
```

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3001` | 服务器端口 |
| `JWT_SECRET` | `dnsmgr-secret-key` | JWT 签名密钥（生产环境请修改！） |
| `DB_PATH` | `./dnsmgr.db` | SQLite 数据库路径 |

## 默认登录

首次运行时会创建默认管理员账号：

- **用户名**：`admin`
- **密码**：`admin123`

⚠️ **首次登录后请立即修改密码！**

## API 文档

启动服务器后访问：`http://localhost:3001/api/docs`

## 新增 DNS 服务商

1. 在 `server/src/lib/dns/providers/myprovider.ts` 创建适配器，实现 `DnsAdapter` 接口
2. 在 `server/src/lib/dns/DnsHelper.ts` 中注册（添加到 `DNS_PROVIDERS` 映射）
3. 在 `server/src/lib/dns/providers/index.ts` 中导出

适配器必须实现 `DnsAdapter` 接口：

```typescript
interface DnsAdapter {
  check(): Promise<boolean>;
  getDomainList(...): Promise<PageResult<DomainInfo>>;
  getDomainRecords(...): Promise<PageResult<DnsRecord>>;
  addDomainRecord(...): Promise<string | null>;
  updateDomainRecord(...): Promise<boolean>;
  deleteDomainRecord(...): Promise<boolean>;
  setDomainRecordStatus(...): Promise<boolean>;
  // ...
}
```

## 技术栈

**后端：**
- Node.js + TypeScript
- Express.js
- SQLite (better-sqlite3)
- JWT 认证
- Swagger/OpenAPI 文档

**前端：**
- React 18 + TypeScript
- Vite
- TailwindCSS v3
- React Router v6
- @tanstack/react-query
- Axios
- lucide-react
