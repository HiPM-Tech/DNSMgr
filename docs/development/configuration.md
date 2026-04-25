# DNSMgr 配置指南

本指南详细介绍 DNSMgr 的所有配置选项和最佳实践。

---

## 环境变量配置

### 基础配置

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `PORT` | 否 | `3001` | 服务端端口 |
| `NODE_ENV` | 否 | `development` | 运行环境：`development`, `production`, `test` |
| `JWT_SECRET` | 生产必需 | - | JWT 基础密钥（生产环境必须设置） |

### 数据库配置

#### SQLite（默认）

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `DB_TYPE` | 否 | `sqlite` | 数据库类型 |
| `DB_PATH` | 否 | `./dnsmgr.db` | SQLite 数据库文件路径 |

#### MySQL

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `DB_TYPE` | 是 | `mysql` | 数据库类型 |
| `DB_HOST` | 是 | - | 数据库主机 |
| `DB_PORT` | 是 | `3306` | 数据库端口 |
| `DB_NAME` | 是 | - | 数据库名称 |
| `DB_USER` | 是 | - | 数据库用户 |
| `DB_PASSWORD` | 是 | - | 数据库密码 |
| `DB_SSL` | 否 | `false` | 启用 SSL |

#### PostgreSQL

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `DB_TYPE` | 是 | `postgresql` | 数据库类型 |
| `DB_HOST` | 是 | - | 数据库主机 |
| `DB_PORT` | 是 | `5432` | 数据库端口 |
| `DB_NAME` | 是 | - | 数据库名称 |
| `DB_USER` | 是 | - | 数据库用户 |
| `DB_PASSWORD` | 是 | - | 数据库密码 |
| `DB_SSL` | 否 | `false` | 启用 SSL |

### 邮件配置

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `SMTP_HOST` | 否 | - | SMTP 服务器地址 |
| `SMTP_PORT` | 否 | `587` | SMTP 端口 |
| `SMTP_USER` | 否 | - | SMTP 用户名 |
| `SMTP_PASS` | 否 | - | SMTP 密码 |
| `SMTP_FROM` | 否 | - | 发件人地址 |
| `SMTP_SECURE` | 否 | `false` | 使用 SSL/TLS |

### OAuth2 配置

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `OAUTH_GOOGLE_CLIENT_ID` | 否 | - | Google OAuth 客户端 ID |
| `OAUTH_GOOGLE_CLIENT_SECRET` | 否 | - | Google OAuth 客户端密钥 |
| `OAUTH_GITHUB_CLIENT_ID` | 否 | - | GitHub OAuth 客户端 ID |
| `OAUTH_GITHUB_CLIENT_SECRET` | 否 | - | GitHub OAuth 客户端密钥 |

---

## 配置文件示例

### 开发环境 (.env.development)

```bash
# 基础配置
NODE_ENV=development
PORT=3001

# JWT 密钥（开发环境可选，生产环境必须设置）
JWT_SECRET=your-development-secret-key

# SQLite 配置
DB_TYPE=sqlite
DB_PATH=./dnsmgr.db
```

### 生产环境 (.env.production)

```bash
# 基础配置
NODE_ENV=production
PORT=3001

# JWT 密钥（生产环境必须设置强密钥）
JWT_SECRET=your-very-strong-production-secret-key-min-32-chars

# PostgreSQL 配置
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dnsmgr
DB_USER=dnsmgr_user
DB_PASSWORD=your-strong-database-password
DB_SSL=true

# SMTP 配置
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=your-smtp-password
SMTP_FROM=DNSMgr <noreply@example.com>
SMTP_SECURE=true

# OAuth2 配置
OAUTH_GOOGLE_CLIENT_ID=your-google-client-id
OAUTH_GOOGLE_CLIENT_SECRET=your-google-client-secret
OAUTH_GITHUB_CLIENT_ID=your-github-client-id
OAUTH_GITHUB_CLIENT_SECRET=your-github-client-secret
```

---

## 数据库配置详解

### SQLite 配置

SQLite 是最简单的配置方式，适合个人使用和小型团队。

**优点**：
- 无需额外安装数据库服务器
- 配置简单，开箱即用
- 数据存储在单个文件中，便于备份

**缺点**：
- 不适合高并发场景
- 单文件大小限制
- 不支持多实例写入

**配置示例**：
```bash
DB_TYPE=sqlite
DB_PATH=/app/data/dnsmgr.db
```

### MySQL 配置

MySQL 适合中小型团队使用，支持高并发和多实例部署。

**优点**：
- 成熟稳定，社区支持广泛
- 支持高并发
- 支持主从复制

**配置示例**：
```bash
DB_TYPE=mysql
DB_HOST=mysql.example.com
DB_PORT=3306
DB_NAME=dnsmgr
DB_USER=dnsmgr_user
DB_PASSWORD=your-password
DB_SSL=true
```

### PostgreSQL 配置

PostgreSQL 是推荐的生产环境数据库，功能强大且稳定。

**优点**：
- 功能最丰富
- 数据完整性最好
- 支持复杂查询

**配置示例**：
```bash
DB_TYPE=postgresql
DB_HOST=postgres.example.com
DB_PORT=5432
DB_NAME=dnsmgr
DB_USER=dnsmgr_user
DB_PASSWORD=your-password
DB_SSL=true
```

---

## JWT 安全配置

### 密钥生成

生产环境必须使用强密钥，建议使用以下命令生成：

```bash
# 生成 64 位随机密钥
openssl rand -base64 64

# 或使用 uuid
cat /proc/sys/kernel/random/uuid
```

### 密钥轮换

DNSMgr 使用双层密钥结构：

1. **基础密钥** (`JWT_SECRET`)：环境变量配置
2. **运行时密钥** (`runtime_secret`)：数据库存储，自动轮换

**轮换时机**：
- 首次创建管理员时自动轮换
- 手动调用 `/api/admin/rotate-secrets` 接口

**注意事项**：
- 轮换后所有现有 JWT Token 会失效
- 用户需要重新登录

---

## 安全配置最佳实践

### 1. 使用 HTTPS

生产环境必须使用 HTTPS：

```nginx
# Nginx 配置示例
server {
    listen 443 ssl http2;
    server_name dnsmgr.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 2. 设置强密码策略

在 `server/.env` 中配置密码策略：

```bash
# 密码最小长度
PASSWORD_MIN_LENGTH=8

# 密码复杂度要求
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBER=true
PASSWORD_REQUIRE_SPECIAL=true
```

### 3. 启用双因素认证 (2FA)

建议所有管理员启用 2FA：

1. 登录后进入 "设置" → "安全"
2. 点击 "启用双因素认证"
3. 使用 Google Authenticator 扫描二维码
4. 输入验证码完成绑定

### 4. API Token 管理

- 定期轮换 API Token
- 使用最小权限原则
- 为不同用途创建不同的 Token

---

## 性能优化配置

### 数据库连接池

#### MySQL 连接池配置

```bash
# 连接池大小（根据服务器配置调整）
DB_POOL_SIZE=10

# 连接超时时间（毫秒）
DB_CONNECT_TIMEOUT=10000

# 查询超时时间（毫秒）
DB_QUERY_TIMEOUT=30000
```

#### PostgreSQL 连接池配置

```bash
# 连接池大小
DB_POOL_SIZE=10

# 最大连接数
DB_MAX_CONNECTIONS=20

# 连接超时时间（毫秒）
DB_CONNECT_TIMEOUT=10000
```

### 缓存配置

```bash
# 启用查询缓存
ENABLE_QUERY_CACHE=true

# 缓存 TTL（秒）
CACHE_TTL=300

# 最大缓存条目数
CACHE_MAX_ITEMS=1000
```

---

## 日志配置

### 日志级别

```bash
# 日志级别：debug, info, warn, error
LOG_LEVEL=info

# 日志输出方式：console, file, both
LOG_OUTPUT=both

# 日志文件路径
LOG_FILE=/var/log/dnsmgr/app.log

# 日志轮转
LOG_ROTATION=true
LOG_MAX_SIZE=10MB
LOG_MAX_FILES=7
```

### 结构化日志

DNSMgr 支持结构化日志输出，便于日志分析：

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "module": "DNS:Cloudflare",
  "message": "Request: GET https://api.cloudflare.com/client/v4/zones",
  "metadata": {
    "provider": "Cloudflare",
    "method": "GET",
    "url": "https://api.cloudflare.com/client/v4/zones"
  }
}
```

---

## 监控配置

### 健康检查端点

```bash
# 健康检查端口
HEALTH_CHECK_PORT=3002

# 健康检查路径
HEALTH_CHECK_PATH=/health
```

### Prometheus 指标

```bash
# 启用 Prometheus 指标
ENABLE_METRICS=true

# 指标端口
METRICS_PORT=9090

# 指标路径
METRICS_PATH=/metrics
```

---

## 备份配置

### 自动备份

```bash
# 启用自动备份
ENABLE_AUTO_BACKUP=true

# 备份间隔（小时）
BACKUP_INTERVAL=24

# 备份保留天数
BACKUP_RETENTION_DAYS=30

# 备份目录
BACKUP_DIR=/app/backups
```

### 手动备份

```bash
# SQLite 备份
cp /app/data/dnsmgr.db /app/backups/dnsmgr-$(date +%Y%m%d).db

# MySQL 备份
mysqldump -u dnsmgr_user -p dnsmgr > /app/backups/dnsmgr-$(date +%Y%m%d).sql

# PostgreSQL 备份
pg_dump -U dnsmgr_user dnsmgr > /app/backups/dnsmgr-$(date +%Y%m%d).sql
```

---

## 故障排除

### 常见问题

#### 1. 数据库连接失败

**症状**：启动时报错 `ECONNREFUSED`

**解决方案**：
```bash
# 检查数据库服务状态
systemctl status mysql
systemctl status postgresql

# 检查防火墙设置
ufw allow 3306  # MySQL
ufw allow 5432  # PostgreSQL

# 检查用户权限
mysql -u root -p -e "GRANT ALL PRIVILEGES ON dnsmgr.* TO 'dnsmgr_user'@'%';"
```

#### 2. JWT 验证失败

**症状**：API 返回 `401 Unauthorized`

**解决方案**：
```bash
# 检查 JWT_SECRET 是否设置
echo $JWT_SECRET

# 重新生成运行时密钥
# 调用 /api/admin/rotate-secrets 接口
```

#### 3. 邮件发送失败

**症状**：邮件发送超时或报错

**解决方案**：
```bash
# 测试 SMTP 连接
telnet smtp.example.com 587

# 检查防火墙
ufw allow out 587

# 验证凭据
# 使用 openssl 测试
openssl s_client -connect smtp.example.com:587 -starttls smtp
```

---

## 配置验证

启动前验证配置：

```bash
cd server
pnpm run validate-config
```

验证内容包括：
- 环境变量完整性
- 数据库连接测试
- SMTP 连接测试
- JWT 密钥强度检查

---

## 环境变量完整列表

```bash
# ============================================
# DNSMgr 环境变量配置
# ============================================

# 基础配置
NODE_ENV=production
PORT=3001
JWT_SECRET=your-strong-secret-key

# 数据库配置
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dnsmgr
DB_USER=dnsmgr_user
DB_PASSWORD=your-password
DB_SSL=true

# 邮件配置
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=your-password
SMTP_FROM=DNSMgr <noreply@example.com>
SMTP_SECURE=true

# OAuth2 配置
OAUTH_GOOGLE_CLIENT_ID=
OAUTH_GOOGLE_CLIENT_SECRET=
OAUTH_GITHUB_CLIENT_ID=
OAUTH_GITHUB_CLIENT_SECRET=

# 性能配置
DB_POOL_SIZE=10
ENABLE_QUERY_CACHE=true
CACHE_TTL=300

# 日志配置
LOG_LEVEL=info
LOG_OUTPUT=both
LOG_FILE=/var/log/dnsmgr/app.log

# 监控配置
ENABLE_METRICS=true
METRICS_PORT=9090

# 备份配置
ENABLE_AUTO_BACKUP=true
BACKUP_INTERVAL=24
BACKUP_RETENTION_DAYS=30
```

---

## 相关文档

- [快速开始](quick-start.md) - 环境搭建和开发流程
- [Docker 部署](docker-deploy.md) - Docker 部署指南
- [开发规范](../DEVELOPMENT.md) - 代码规范和开发标准
- [架构设计](../architecture/overview.md) - 系统架构设计
