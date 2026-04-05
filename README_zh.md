# DNSMgr - DNS 聚合管理平台

一个现代化的 DNS 聚合管理平台，前端使用 React + TailwindCSS，后端使用 Node.js + TypeScript。

## 文档链接

- 英文文档: [README.md](README.md)

## 功能特性

- **多服务商支持**: 可管理 16 家 DNS 服务商的解析记录：
  - 阿里云 (Aliyun), DNSPod (腾讯云), 华为云 (Huawei Cloud), 百度云 (Baidu Cloud)
  - 火山引擎 (Volcengine), 京东云 (JD Cloud), Cloudflare, DNS.LA
  - 西部数码 (West Digital), 青云 (Qingcloud), NameSilo, 宝塔面板 (BT Panel)
  - Spaceship, PowerDNS, 阿里云 ESA (Aliyun ESA), 腾讯 EdgeOne (Tencent EdgeOne)

- **多用户与团队管理**: 基于角色的访问控制（admin/member），团队共享域名
- **完整的 DNS 记录管理**: 支持所有记录类型的增删改查（A、AAAA、CNAME、MX、TXT、SRV、CAA 等）
- **现代化 UI**: React 18 + TailwindCSS，响应式设计
- **API 文档**: Swagger UI 位于 `/api/docs`
- **可扩展架构**: 抽象 DNS 接口，易于添加新服务商

## 架构

```
DNSMgr/
├── server/          # Node.js + TypeScript 后端
│   ├── src/
│   │   ├── lib/dns/ # DNS 服务商适配器（抽象接口）
│   │   ├── routes/  # REST API 路由
│   │   ├── middleware/ # 认证（JWT）、校验
│   │   └── db/      # SQLite 数据库
├── client/          # React + Vite + TailwindCSS 前端
    └── src/
        ├── pages/   # 页面
        ├── components/ # 复用组件
        └── api/     # API 客户端
```

## 快速开始

### 环境要求
- Node.js >= 18
- pnpm

### 安装依赖

```bash
pnpm install
```

### 开发模式

#### 方式一：并发启动（推荐大多数用户使用）

使用单个命令同时启动前后端（分别运行在不同端口）：

```bash
# 同时启动后端（端口 3001）与前端（端口 5173）
pnpm dev
```

访问地址：http://localhost:5173

#### 方式二：独立启动（适合高级用户）

在独立终端中分别启动前后端：

```bash
# 终端 1 - 仅后端（端口 3001）
cd server && pnpm dev

# 终端 2 - 仅前端（端口 5173）
cd client && pnpm dev
```

### 生产构建

```bash
pnpm build
```

### 源码运行 - 聚合模式（单端口）

前后端在同一个端口（3001）运行 - 后端同时提供静态文件服务：

```bash
# 步骤 1：先构建前端
pnpm --filter client build

# 步骤 2：仅启动后端（同时提供 API 和前端页面，端口 3001）
cd server && pnpm dev
```

访问地址：http://localhost:3001

此模式适用于以下场景：
- 只需暴露一个端口
- 与 Docker 部署行为保持一致
- 简化反向代理配置

### Docker 部署

Docker 部署使用一体化模式（前后端合并在一个容器中）：

```bash
# 构建并运行
docker build -t dnsmgr .
docker run -d \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  --name dnsmgr \
  dnsmgr
```

或使用 Docker Compose：

```bash
docker-compose up -d
```

访问地址：http://localhost:3001

### 环境变量

将 `.env.example` 复制为 `server/.env`：

```bash
cp server/.env.example server/.env
```

| 变量 | 默认值 | 说明 |
|----------|---------|-------------|
| `PORT` | `3001` | 服务端端口 |
| `JWT_SECRET` | `dnsmgr-secret-key` | JWT 签名密钥（生产环境请修改） |
| `DB_PATH` | `./dnsmgr.db` | SQLite 数据库路径 |
| `DB_TYPE` | `sqlite` | 数据库类型：`sqlite`、`mysql` 或 `postgresql` |
| `DB_HOST` | - | 数据库主机（MySQL/PostgreSQL 使用） |
| `DB_PORT` | - | 数据库端口（MySQL/PostgreSQL 使用） |
| `DB_NAME` | - | 数据库名称（MySQL/PostgreSQL 使用） |
| `DB_USER` | - | 数据库用户（MySQL/PostgreSQL 使用） |
| `DB_PASS` | - | 数据库密码（MySQL/PostgreSQL 使用） |

## 默认登录

首次运行会创建默认管理员账号：

- **用户名**: `admin`
- **密码**: `admin123`

?? **首次登录后请立即修改密码！**

## API 文档

服务启动后访问：`http://localhost:3001/api/docs`

服务商 API 对齐说明：
- [provider-api-alignment.md](docs/provider-api-alignment.md)
- 包含腾讯 DNSPod、腾讯 EO、阿里云 DNS 官方 API 映射与当前实现状态。

服务商文档：
- [西部数码 DNS](docs/providers/west.md)

## 记录模型说明

- DNS 记录仍保留通用 `line` 字段以兼容历史逻辑。
- 对于 Cloudflare，请使用请求/响应中的服务商专用字段：
  - `cloudflare.proxied`: 代理开关（`true` = 代理，`false` = 仅 DNS）
  - `cloudflare.proxiable`: 当前记录类型是否支持代理
- Cloudflare 创建/更新的优先级：
  - 如果提供 `cloudflare.proxied`，则优先使用
  - 否则回退到 `line`（`'1'` = 代理，`'0'` = 仅 DNS）

## 添加新的 DNS 服务商

1. 在 `server/src/lib/dns/providers/myprovider.ts` 中创建新的适配器并实现 `DnsAdapter`
2. 在 `server/src/lib/dns/DnsHelper.ts` 中注册（加入 `DNS_PROVIDERS` 映射）
3. 在 `server/src/lib/dns/providers/index.ts` 中导出

适配器需要实现 `DnsAdapter` 接口：

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



## Provider 

/ DNS ˺ʱAPI  lego  provider Զ淶Ϊڲͣ

| ڲ | ֱ֧ |
|---|---|
| `aliyun` | `aliyun`, `alidns` |
| `aliyunesa` | `aliesa` |
| `baidu` | `baiducloud` |
| `huawei` | `huaweicloud` |
| `huoshan` | `huoshan`, `volcengine` |
| `west` | `westcn` |
| `cloudflare` | `cloudflare` |
| `jdcloud` | `jdcloud` |
| `namesilo` | `namesilo` |
| `rainyun` | `rainyun` |
| `powerdns` | `powerdns`, `pdns` |
| `dnspod` | `dnspod`, `tencentcloud` |
| `tencenteo` | `tencenteo`, `edgeone` |
## 技术栈

**后端:**
- Node.js + TypeScript
- Express.js
- SQLite (better-sqlite3)
- JWT 认证
- Swagger/OpenAPI 文档

**前端:**
- React 18 + TypeScript
- Vite
- TailwindCSS v3
- React Router v6
- @tanstack/react-query
- Axios
- lucide-react

## License

MIT
