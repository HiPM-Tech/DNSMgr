# 快速开始

## 环境要求

- Node.js >= 18
- pnpm

## 安装依赖

```bash
pnpm install
```

## 开发模式

### 方式一：并发启动（推荐）

使用单个命令同时启动前后端：

```bash
# 同时启动后端（端口 3001）与前端（端口 5173）
pnpm dev
```

访问地址：http://localhost:5173

> 首次启动提示：如果系统尚未初始化，请访问初始化向导 `http://localhost:5173/setup` 配置数据库并创建首个管理员。

### 方式二：独立启动

在独立终端中分别启动前后端：

```bash
# 终端 1 - 仅后端（端口 3001）
cd server && pnpm dev

# 终端 2 - 仅前端（端口 5173）
cd client && pnpm dev
```

## 生产构建

```bash
pnpm build
```

## 源码运行 - 聚合模式（单端口）

前后端在同一个端口（3001）运行：

```bash
# 步骤 1：先构建前端
pnpm --filter client build

# 步骤 2：仅启动后端（同时提供 API 和前端页面，端口 3001）
cd server && pnpm dev
```

访问地址：http://localhost:3001

## 环境变量

将 `.env.example` 复制为 `server/.env`：

```bash
cp server/.env.example server/.env
```

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3001` | 服务端端口 |
| `NODE_ENV` | `development` | 运行环境 |
| `JWT_SECRET` | 未设置 | JWT 基础密钥 |
| `DB_PATH` | `./dnsmgr.db` | SQLite 数据库路径 |
| `DB_TYPE` | `sqlite` | 数据库类型 |
| `DB_HOST` | - | 数据库主机 |
| `DB_PORT` | - | 数据库端口 |
| `DB_NAME` | - | 数据库名称 |
| `DB_USER` | - | 数据库用户 |
| `DB_PASSWORD` | - | 数据库密码 |
| `DB_SSL` | `false` | 启用 SSL |

## Docker 部署

### 使用预构建镜像

```bash
docker run -d \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  --name dnsmgr \
  ghcr.io/hipm-tech/dnsmgr:latest
```

### Docker Compose

```bash
# 下载编排文件
curl -O https://raw.githubusercontent.com/HiPM-Tech/DNSMgr/main/docker-compose.yml

# 启动服务
docker-compose up -d
```

## 初始化流程

1. 首次访问系统时，会自动跳转到初始化向导
2. 配置数据库连接（SQLite/MySQL/PostgreSQL）
3. 创建超级管理员账户
4. 使用管理员账户登录系统

## 开发规范

### 数据库操作

必须使用业务适配器层的业务操作模块：

```typescript
// ✅ 正确 - 使用业务操作模块
import { UserOperations, DomainOperations } from '../db';

const user = await UserOperations.getById(1);
const domains = await DomainOperations.getByAccountId(accountId);

// ❌ 错误 - 禁止在业务代码中直接编写 SQL
const user = await query<User>('SELECT * FROM users WHERE id = ?', [userId]);

// ❌ 错误 - 禁止使用已废除的兼容层
import { getAdapter } from '../db/adapter';
const db = getAdapter();
```

**重要原则**：业务代码只能通过业务操作模块（如 `UserOperations`, `DomainOperations` 等）访问数据库，禁止直接调用 `query`, `get`, `execute` 等底层函数。

### 代码风格

- 使用 TypeScript 严格模式
- 遵循 ESLint 配置
- 使用 Prettier 格式化代码
