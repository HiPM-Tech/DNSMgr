# DNSMgr Docker 部署指南

本指南详细介绍如何使用 Docker 部署 DNSMgr 服务。

---

## 快速开始

### 使用预构建镜像（推荐）

```bash
# 运行 DNSMgr
docker run -d \
  --name dnsmgr \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  -e JWT_SECRET=your-strong-secret-key \
  ghcr.io/hipm-tech/dnsmgr:latest
```

访问 http://localhost:3001 开始使用。

---

## Docker Compose 部署

### 基础部署

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  dnsmgr:
    image: ghcr.io/hipm-tech/dnsmgr:latest
    container_name: dnsmgr
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET:-change-me-in-production}
      - DB_TYPE=sqlite
      - DB_PATH=/app/data/dnsmgr.db
```

启动服务：

```bash
docker-compose up -d
```

### 使用 PostgreSQL

```yaml
version: '3.8'

services:
  dnsmgr:
    image: ghcr.io/hipm-tech/dnsmgr:latest
    container_name: dnsmgr
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET:-change-me-in-production}
      - DB_TYPE=postgresql
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=dnsmgr
      - DB_USER=dnsmgr
      - DB_PASSWORD=${DB_PASSWORD:-dnsmgr}
    depends_on:
      - postgres

  postgres:
    image: postgres:16-alpine
    container_name: dnsmgr-postgres
    restart: unless-stopped
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=dnsmgr
      - POSTGRES_USER=dnsmgr
      - POSTGRES_PASSWORD=${DB_PASSWORD:-dnsmgr}

volumes:
  postgres_data:
```

### 使用 MySQL

```yaml
version: '3.8'

services:
  dnsmgr:
    image: ghcr.io/hipm-tech/dnsmgr:latest
    container_name: dnsmgr
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET:-change-me-in-production}
      - DB_TYPE=mysql
      - DB_HOST=mysql
      - DB_PORT=3306
      - DB_NAME=dnsmgr
      - DB_USER=dnsmgr
      - DB_PASSWORD=${DB_PASSWORD:-dnsmgr}
    depends_on:
      - mysql

  mysql:
    image: mysql:8.0
    container_name: dnsmgr-mysql
    restart: unless-stopped
    volumes:
      - mysql_data:/var/lib/mysql
    environment:
      - MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD:-root}
      - MYSQL_DATABASE=dnsmgr
      - MYSQL_USER=dnsmgr
      - MYSQL_PASSWORD=${DB_PASSWORD:-dnsmgr}

volumes:
  mysql_data:
```

### 完整生产环境配置

```yaml
version: '3.8'

services:
  dnsmgr:
    image: ghcr.io/hipm-tech/dnsmgr:latest
    container_name: dnsmgr
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    environment:
      # 基础配置
      - NODE_ENV=production
      - PORT=3001
      - JWT_SECRET=${JWT_SECRET}
      
      # 数据库配置
      - DB_TYPE=postgresql
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=dnsmgr
      - DB_USER=dnsmgr
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_SSL=false
      
      # 邮件配置
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT:-587}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
      - SMTP_FROM=${SMTP_FROM}
      - SMTP_SECURE=${SMTP_SECURE:-false}
      
      # OAuth2 配置
      - OAUTH_GOOGLE_CLIENT_ID=${OAUTH_GOOGLE_CLIENT_ID}
      - OAUTH_GOOGLE_CLIENT_SECRET=${OAUTH_GOOGLE_CLIENT_SECRET}
      - OAUTH_GITHUB_CLIENT_ID=${OAUTH_GITHUB_CLIENT_ID}
      - OAUTH_GITHUB_CLIENT_SECRET=${OAUTH_GITHUB_CLIENT_SECRET}
      
      # 日志配置
      - LOG_LEVEL=info
      - LOG_OUTPUT=both
      - LOG_FILE=/app/logs/app.log
    depends_on:
      - postgres
    networks:
      - dnsmgr-network

  postgres:
    image: postgres:16-alpine
    container_name: dnsmgr-postgres
    restart: unless-stopped
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=dnsmgr
      - POSTGRES_USER=dnsmgr
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    networks:
      - dnsmgr-network

  # 可选：使用 Nginx 反向代理
  nginx:
    image: nginx:alpine
    container_name: dnsmgr-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - dnsmgr
    networks:
      - dnsmgr-network

volumes:
  postgres_data:

networks:
  dnsmgr-network:
    driver: bridge
```

---

## 环境变量配置

创建 `.env` 文件：

```bash
# JWT 密钥（生产环境必须设置强密钥）
JWT_SECRET=your-very-strong-secret-key-min-32-characters

# 数据库密码
DB_PASSWORD=your-strong-database-password

# MySQL root 密码（如使用 MySQL）
MYSQL_ROOT_PASSWORD=your-mysql-root-password

# SMTP 配置
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=your-smtp-password
SMTP_FROM=DNSMgr <noreply@example.com>
SMTP_SECURE=false

# OAuth2 配置（可选）
OAUTH_GOOGLE_CLIENT_ID=your-google-client-id
OAUTH_GOOGLE_CLIENT_SECRET=your-google-client-secret
OAUTH_GITHUB_CLIENT_ID=your-github-client-id
OAUTH_GITHUB_CLIENT_SECRET=your-github-client-secret
```

---

## Nginx 反向代理配置

### 基础配置

```nginx
events {
    worker_connections 1024;
}

http {
    upstream dnsmgr {
        server dnsmgr:3001;
    }

    server {
        listen 80;
        server_name dnsmgr.example.com;

        location / {
            proxy_pass http://dnsmgr;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
    }
}
```

### HTTPS 配置

```nginx
events {
    worker_connections 1024;
}

http {
    upstream dnsmgr {
        server dnsmgr:3001;
    }

    # HTTP 重定向到 HTTPS
    server {
        listen 80;
        server_name dnsmgr.example.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name dnsmgr.example.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        location / {
            proxy_pass http://dnsmgr;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            
            # 超时设置
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }
    }
}
```

---

## 数据备份

### 自动备份脚本

创建 `backup.sh`：

```bash
#!/bin/bash

# 备份目录
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份 SQLite
docker cp dnsmgr:/app/data/dnsmgr.db $BACKUP_DIR/dnsmgr_$DATE.db

# 或备份 PostgreSQL
docker exec dnsmgr-postgres pg_dump -U dnsmgr dnsmgr > $BACKUP_DIR/dnsmgr_$DATE.sql

# 压缩备份
gzip $BACKUP_DIR/dnsmgr_$DATE.*

# 保留最近 30 天的备份
find $BACKUP_DIR -name "dnsmgr_*.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/dnsmgr_$DATE.gz"
```

添加到 crontab：

```bash
# 每天凌晨 2 点备份
0 2 * * * /path/to/backup.sh >> /var/log/dnsmgr-backup.log 2>&1
```

---

## 更新升级

### 更新到最新版本

```bash
# 拉取最新镜像
docker pull ghcr.io/hipm-tech/dnsmgr:latest

# 停止并删除旧容器
docker-compose down

# 启动新容器
docker-compose up -d
```

### 指定版本升级

```bash
# 编辑 docker-compose.yml，修改镜像标签
# image: ghcr.io/hipm-tech/dnsmgr:v1.2.0

# 重新部署
docker-compose up -d
```

---

## 监控与日志

### 查看日志

```bash
# 查看应用日志
docker logs -f dnsmgr

# 查看最后 100 行日志
docker logs --tail 100 dnsmgr

# 查看 PostgreSQL 日志
docker logs -f dnsmgr-postgres
```

### 健康检查

```bash
# 检查容器状态
docker ps

# 检查健康状态
docker inspect --format='{{.State.Health.Status}}' dnsmgr

# 手动健康检查
curl http://localhost:3001/api/health
```

---

## 故障排除

### 常见问题

#### 1. 容器无法启动

```bash
# 查看日志
docker logs dnsmgr

# 检查端口占用
netstat -tlnp | grep 3001

# 检查权限
ls -la ./data
```

#### 2. 数据库连接失败

```bash
# 检查数据库容器状态
docker ps | grep postgres

# 检查网络连接
docker network inspect dnsmgr_dnsmgr-network

# 检查数据库日志
docker logs dnsmgr-postgres
```

#### 3. 权限问题

```bash
# 修复数据目录权限
sudo chown -R 1000:1000 ./data

# 或修改 docker-compose.yml
services:
  dnsmgr:
    user: "${UID}:${GID}"
```

#### 4. 内存不足

```bash
# 查看容器内存使用
docker stats dnsmgr

# 增加内存限制
docker run -m 512m --memory-swap 1g ...
```

---

## 安全建议

### 1. 使用非 root 用户运行

```dockerfile
# 在 Dockerfile 中添加
RUN adduser -D -u 1000 appuser
USER appuser
```

### 2. 限制容器资源

```yaml
services:
  dnsmgr:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### 3. 使用只读文件系统

```yaml
services:
  dnsmgr:
    read_only: true
    tmpfs:
      - /tmp
      - /var/tmp
```

### 4. 禁用不需要的功能

```yaml
services:
  dnsmgr:
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - SETGID
      - SETUID
```

---

## 多实例部署

### 使用 Docker Swarm

```yaml
version: '3.8'

services:
  dnsmgr:
    image: ghcr.io/hipm-tech/dnsmgr:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - DB_TYPE=postgresql
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=dnsmgr
      - DB_USER=dnsmgr
      - DB_PASSWORD=${DB_PASSWORD}
    networks:
      - dnsmgr-network

  postgres:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=dnsmgr
      - POSTGRES_USER=dnsmgr
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    networks:
      - dnsmgr-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    configs:
      - source: nginx_conf
        target: /etc/nginx/nginx.conf
    networks:
      - dnsmgr-network

volumes:
  postgres_data:

networks:
  dnsmgr-network:
    driver: overlay

configs:
  nginx_conf:
    external: true
```

部署：

```bash
docker stack deploy -c docker-compose.yml dnsmgr
```

---

## 相关文档

- [快速开始](quick-start.md) - 环境搭建和开发流程
- [配置指南](configuration.md) - 详细配置说明
- [开发规范](../DEVELOPMENT.md) - 代码规范和开发标准
- [架构设计](../architecture/overview.md) - 系统架构设计
