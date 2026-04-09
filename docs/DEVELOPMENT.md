# DNSMgr 开发声明

## 项目概述

DNSMgr 是一个现代化的 DNS 聚合管理平台，采用前后端分离架构，支持管理多个 DNS 服务商的域名解析记录。

## 技术栈声明

### 后端技术栈

| 技术 | 版本要求 | 用途 |
|------|----------|------|
| Node.js | >= 18 | 运行时环境 |
| TypeScript | >= 5.0 | 开发语言 |
| Express.js | ^4.18 | Web 框架 |
| better-sqlite3 | ^9.4 | SQLite 驱动 |
| mysql2 | ^3.9 | MySQL 驱动 |
| pg | ^8.11 | PostgreSQL 驱动 |
| jsonwebtoken | ^9.0 | JWT 认证 |
| bcrypt | ^5.1 | 密码加密 |
| swagger-jsdoc | ^6.2 | API 文档生成 |

### 前端技术栈

| 技术 | 版本要求 | 用途 |
|------|----------|------|
| React | ^18.2 | UI 框架 |
| TypeScript | >= 5.0 | 开发语言 |
| Vite | ^5.0 | 构建工具 |
| TailwindCSS | ^3.4 | CSS 框架 |
| React Router | ^6.21 | 路由管理 |
| @tanstack/react-query | ^5.17 | 数据请求和缓存 |
| Axios | ^1.6 | HTTP 客户端 |
| lucide-react | ^0.309 | 图标库 |
| react-i18next | ^14.0 | 国际化 |

## 数据库架构声明

### 三层架构设计

DNSMgr 采用严格的三层数据库架构：

```
路由/Service层 → 业务适配器层 → 数据库抽象层 → 驱动层 → 数据库
```

### 第一层：业务适配器层 (Business Adapter Layer)

**文件位置**: `server/src/db/business-adapter.ts`

**核心原则**:
1. **SQL 语句集中管理**: 所有 SQL 语句都定义在此层
2. **业务代码禁止直接编写 SQL**: 只能通过业务操作模块访问数据库
3. **API 调用规范**: 业务代码必须使用 `UserOperations`, `DomainOperations` 等模块

**正确用法**:
```typescript
// ✅ 正确 - 使用业务操作模块
import { UserOperations, DomainOperations } from '../db';

const user = await UserOperations.getById(1);
const domains = await DomainOperations.getByAccountId(accountId);
```

**错误用法**:
```typescript
// ❌ 错误 - 禁止在业务代码中直接编写 SQL
import { query, get, execute } from '../db';
const user = await query<User>('SELECT * FROM users WHERE id = ?', [id]);

// ❌ 错误 - 禁止使用已废除的兼容层
import { getAdapter } from '../db/adapter';
const db = getAdapter();
```

### 第二层：数据库抽象层 (Database Abstraction Layer)

**文件位置**: `server/src/db/core/`

**职责**:
- 统一类型定义
- 连接管理（单例模式）
- 配置管理

### 第三层：驱动层 (Driver Layer)

**文件位置**: `server/src/db/drivers/`

**支持的驱动**:
- MySQL 驱动（连接池）
- PostgreSQL 驱动（连接池）
- SQLite 驱动（better-sqlite3）

## 开发规范声明

### 后端开发规范

#### 1. 数据库访问规范

- **必须使用业务操作模块**: `UserOperations`, `DomainOperations`, `DnsAccountOperations`, `TeamOperations`, `SettingsOperations`, `AuditOperations`
- **禁止直接调用底层函数**: `query`, `get`, `execute`, `insert`, `run` 只能在业务适配器层内部使用
- **禁止直接编写 SQL**: 所有 SQL 语句必须封装在业务适配器层

#### 2. 错误处理规范

```typescript
// ✅ 正确
try {
  const user = await UserOperations.getById(id);
  if (!user) {
    return res.status(404).json({ code: -1, msg: 'User not found' });
  }
  // ...
} catch (error) {
  log.error('GetUser', 'Failed to get user', { id, error });
  return res.status(500).json({ code: -1, msg: 'Internal server error' });
}
```

#### 3. 日志规范

```typescript
// ✅ 正确
import { log } from '../lib/logger';

log.info('ModuleName', 'Operation completed', { detail: 'value' });
log.error('ModuleName', 'Operation failed', error);
log.providerRequest('Cloudflare', 'GET', url, params);
log.dbQuery('SELECT', sql, params);
```

#### 4. 类型安全规范

```typescript
// ✅ 正确
interface User {
  id: number;
  username: string;
  email: string;
  role: number;
  createdAt: string;
}

async function getUserById(id: number): Promise<User | undefined> {
  return UserOperations.getById(id);
}
```

### 前端开发规范

#### 1. 状态管理规范

```typescript
// ✅ 正确 - 使用 React Query
import { useQuery, useMutation } from '@tanstack/react-query';

const { data: users, isLoading } = useQuery({
  queryKey: ['users'],
  queryFn: () => usersApi.list(),
});

const mutation = useMutation({
  mutationFn: usersApi.create,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
  },
});
```

#### 2. 国际化规范

```typescript
// ✅ 正确
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  return <h1>{t('page.title')}</h1>;
}
```

#### 3. 错误处理规范

```typescript
// ✅ 正确
try {
  await mutation.mutateAsync(data);
  toast.success(t('common.success'));
} catch (error) {
  toast.error(error.message || t('common.error'));
}
```

## API 设计声明

### RESTful API 规范

- **URL 设计**: 使用名词复数形式，如 `/api/users`, `/api/domains`
- **HTTP 方法**: GET（查询）、POST（创建）、PUT（更新）、DELETE（删除）、PATCH（部分更新）
- **状态码**: 200（成功）、201（创建成功）、400（请求错误）、401（未认证）、403（无权限）、404（不存在）、500（服务器错误）
- **响应格式**: `{ code: number, msg: string, data?: any }`

### 认证机制

- **JWT Token**: 用于用户认证，有效期 7 天
- **API Token**: 用于程序化访问，可配置权限和有效期
- **双层密钥**: JWT 签名使用 `JWT_SECRET + runtime_secret`

## 安全声明

### 1. 认证安全

- 密码使用 bcrypt 加密存储
- JWT Token 支持刷新机制
- 支持双因素认证（2FA/TOTP）
- 支持 Passkeys（WebAuthn）

### 2. 访问控制

- 基于角色的访问控制（RBAC）
- 域名级权限控制
- API Token 权限控制

### 3. 安全头

```
Content-Security-Policy: default-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

## 测试声明

### 测试类型

1. **单元测试**: 测试单个函数或模块
2. **集成测试**: 测试模块间交互
3. **端到端测试**: 测试完整业务流程

### 测试要求

- 所有业务逻辑必须覆盖单元测试
- 所有 API 端点必须覆盖集成测试
- 关键业务流程必须覆盖端到端测试

## 部署声明

### Docker 部署

```bash
# 使用预构建镜像
docker run -d \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  --name dnsmgr \
  ghcr.io/hipm-tech/dnsmgr:latest
```

### 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| PORT | 否 | 3001 | 服务端口 |
| NODE_ENV | 否 | development | 运行环境 |
| JWT_SECRET | 是（生产） | - | JWT 基础密钥 |
| DB_TYPE | 否 | sqlite | 数据库类型 |
| DB_PATH | 否 | ./dnsmgr.db | SQLite 路径 |
| DB_HOST | 是（MySQL/PG） | - | 数据库主机 |
| DB_PORT | 是（MySQL/PG） | - | 数据库端口 |
| DB_NAME | 是（MySQL/PG） | - | 数据库名称 |
| DB_USER | 是（MySQL/PG） | - | 数据库用户 |
| DB_PASSWORD | 是（MySQL/PG） | - | 数据库密码 |

## 贡献声明

### 提交规范

- 使用 Conventional Commits 规范
- 提交信息格式: `type(scope): subject`
- 类型: feat, fix, docs, style, refactor, test, chore

### 代码审查

- 所有代码必须通过审查才能合并
- 审查重点: 数据库访问规范、类型安全、错误处理、日志记录
- 禁止直接提交到 main 分支

## 许可证声明

DNSMgr 采用 MIT 许可证开源。

Copyright (c) 2024 DNSMgr Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
