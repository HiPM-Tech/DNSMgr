# DNSMgr API 参考文档

> 🚀 完整的 RESTful API 文档，方便第三方平台对接

## 基础信息

| 项目 | 说明 |
|------|------|
| **Base URL** | `http://your-dnsmgr-instance.com/api` |
| **认证方式** | Bearer Token (JWT 或 API Token) |
| **Content-Type** | `application/json` |
| **响应格式** | 统一 JSON 格式 |

## 认证方式

### 1. 用户 JWT 认证

用于浏览器/Web UI 的用户会话认证。

```http
Authorization: Bearer <user-jwt-token>
```

**获取方式**: 通过 `/api/auth/login` 登录接口获取

### 2. API Token 认证 (推荐用于第三方对接)

用于程序化访问、CI/CD、自动化脚本等场景。

```http
Authorization: Bearer dnsmgr_<64位十六进制字符串>
```

**Token 格式**: `dnsmgr_` 前缀 + 64位十六进制随机字符串 (总长度 72 字符)

**示例**: `dnsmgr_a1b2c3d4e5f6789012345678901234567890abcd...`

---

## API Token 管理

### 创建 API Token

```http
POST /api/tokens
Authorization: Bearer <user-jwt-token>
Content-Type: application/json

{
  "name": "CI/CD Deployment Token",
  "allowed_domains": [1, 2, 3],
  "start_time": "2025-01-01T00:00:00Z",
  "end_time": "2025-12-31T23:59:59Z"
}
```

**参数说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | Token 名称，用于识别用途 |
| `allowed_domains` | number[] | ❌ | 允许的域名 ID 列表，空数组表示所有域名 |
| `start_time` | string | ❌ | 生效时间 (ISO 8601 格式) |
| `end_time` | string | ❌ | 过期时间，null 表示永不过期 |

**响应示例**:

```json
{
  "code": 0,
  "data": {
    "token": "dnsmgr_abc123def456...",
    "tokenData": {
      "id": 1,
      "name": "CI/CD Deployment Token",
      "allowed_domains": [1, 2, 3],
      "is_active": true,
      "created_at": "2025-01-15T10:30:00Z"
    }
  },
  "msg": "Token created successfully"
}
```

⚠️ **重要**: `token` 字段只在创建时返回一次，请妥善保存！

### 获取 Token 列表

```http
GET /api/tokens
Authorization: Bearer <user-jwt-token>
```

### 删除 Token

```http
DELETE /api/tokens/:id
Authorization: Bearer <user-jwt-token>
```

### 启用/禁用 Token

```http
PATCH /api/tokens/:id/status
Authorization: Bearer <user-jwt-token>
Content-Type: application/json

{
  "is_active": false
}
```

---

## 域名管理 API

### 获取域名列表

```http
GET /api/domains
Authorization: Bearer <token>
```

**响应示例**:

```json
{
  "code": 0,
  "data": [
    {
      "id": 1,
      "name": "example.com",
      "account_id": 1,
      "account_name": "Aliyun Account",
      "provider": "aliyun",
      "records_count": 5,
      "expires_at": "2026-01-15T00:00:00Z",
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "msg": "success"
}
```

### 添加域名

```http
POST /api/domains
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "example.com",
  "account_id": 1,
  "remark": "Production domain"
}
```

### 获取域名详情

```http
GET /api/domains/:id
Authorization: Bearer <token>
```

### 更新域名

```http
PUT /api/domains/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "remark": "Updated remark"
}
```

### 删除域名

```http
DELETE /api/domains/:id
Authorization: Bearer <token>
```

---

## DNS 记录管理 API

### 获取记录列表

```http
GET /api/domains/:domain_id/records
Authorization: Bearer <token>
```

**查询参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `type` | string | 按记录类型筛选 (A, AAAA, CNAME, MX, TXT, etc.) |
| `host` | string | 按主机记录筛选 |

### 添加解析记录

```http
POST /api/domains/:domain_id/records
Authorization: Bearer <token>
Content-Type: application/json

{
  "host": "www",
  "type": "A",
  "value": "192.168.1.1",
  "ttl": 600,
  "line": "default",
  "proxied": false
}
```

**参数说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `host` | string | ✅ | 主机记录，@ 表示根域名 |
| `type` | string | ✅ | 记录类型: A, AAAA, CNAME, MX, TXT, NS, SRV, CAA |
| `value` | string | ✅ | 记录值 |
| `ttl` | number | ❌ | TTL (秒)，默认 600 |
| `line` | string | ❌ | 线路，默认 "default" |
| `proxied` | boolean | ❌ | Cloudflare 代理，默认 false |
| `priority` | number | ❌ | MX/SRV 记录优先级 |

### 更新解析记录

```http
PUT /api/domains/:domain_id/records/:record_id
Authorization: Bearer <token>
Content-Type: application/json

{
  "value": "192.168.1.2",
  "ttl": 300
}
```

### 删除解析记录

```http
DELETE /api/domains/:domain_id/records/:record_id
Authorization: Bearer <token>
```

### 启用/禁用记录

```http
PATCH /api/domains/:domain_id/records/:record_id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "enabled": false
}
```

---

## DNS 账号管理 API

### 获取账号列表

```http
GET /api/accounts
Authorization: Bearer <token>
```

### 添加 DNS 账号

```http
POST /api/accounts
Authorization: Bearer <token>
Content-Type: application/json

{
  "provider": "aliyun",
  "name": "My Aliyun Account",
  "credentials": {
    "access_key_id": "LTAI...",
    "access_key_secret": "..."
  }
}
```

**支持的服务商**:

| 服务商 | provider 值 | 所需凭证 |
|--------|-------------|----------|
| 阿里云 | `aliyun` | access_key_id, access_key_secret |
| 腾讯云 | `tencent` | secret_id, secret_key |
| 华为云 | `huawei` | access_key_id, secret_access_key |
| Cloudflare | `cloudflare` | api_token 或 email + api_key |
| DNSPod | `dnspod` | id, token |
| GoDaddy | `godaddy` | api_key, api_secret |

---

## 用户管理 API (管理员)

### 获取用户列表

```http
GET /api/users
Authorization: Bearer <admin-token>
```

### 创建用户

```http
POST /api/users
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "username": "john_doe",
  "nickname": "John Doe",
  "email": "john@example.com",
  "password": "secure_password",
  "role": 1
}
```

**角色说明**:

| 角色值 | 名称 | 权限 |
|--------|------|------|
| 1 | 普通用户 | 管理自己的域名和记录 |
| 2 | 管理员 | 管理所有资源，不能管理用户 |
| 3 | 超级管理员 | 完全权限 |

---

## 审计日志 API

### 获取审计日志

```http
GET /api/audit/logs
Authorization: Bearer <token>
```

**查询参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `domain` | string | 按域名筛选 |
| `action` | string | 按操作类型筛选 |
| `start_date` | string | 开始日期 (YYYY-MM-DD) |
| `end_date` | string | 结束日期 (YYYY-MM-DD) |
| `page` | number | 页码，默认 1 |
| `limit` | number | 每页数量，默认 20 |

---

## 系统状态 API

### 获取系统状态

```http
GET /api/system/status
Authorization: Bearer <token>
```

**响应示例**:

```json
{
  "code": 0,
  "data": {
    "version": "1.1.0",
    "database": {
      "type": "sqlite",
      "version": "3.45.0"
    },
    "uptime": 86400,
    "timezone": "Asia/Shanghai"
  },
  "msg": "success"
}
```

---

## 响应状态码

### HTTP 状态码

| 状态码 | 含义 | 说明 |
|--------|------|------|
| 200 | OK | 请求成功 |
| 201 | Created | 创建成功 |
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未认证或 Token 无效 |
| 403 | Forbidden | 无权限访问 |
| 404 | Not Found | 资源不存在 |
| 500 | Internal Server Error | 服务器内部错误 |

### 业务状态码

响应体中的 `code` 字段:

| code | 含义 |
|------|------|
| 0 | 成功 |
| 400001 | 参数验证失败 |
| 401001 | Token 无效或过期 |
| 403001 | 权限不足 |
| 404001 | 资源不存在 |
| 500001 | 服务器内部错误 |

---

## 第三方对接示例

### Python 示例

```python
import requests
import json

class DNSMgrClient:
    def __init__(self, base_url, token):
        self.base_url = base_url.rstrip('/')
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
    
    def get_domains(self):
        """获取域名列表"""
        response = requests.get(
            f'{self.base_url}/api/domains',
            headers=self.headers
        )
        return response.json()
    
    def add_record(self, domain_id, host, record_type, value, ttl=600):
        """添加解析记录"""
        data = {
            'host': host,
            'type': record_type,
            'value': value,
            'ttl': ttl
        }
        response = requests.post(
            f'{self.base_url}/api/domains/{domain_id}/records',
            headers=self.headers,
            json=data
        )
        return response.json()
    
    def update_record(self, domain_id, record_id, value):
        """更新解析记录"""
        data = {'value': value}
        response = requests.put(
            f'{self.base_url}/api/domains/{domain_id}/records/{record_id}',
            headers=self.headers,
            json=data
        )
        return response.json()

# 使用示例
client = DNSMgrClient('https://dnsmgr.example.com', 'dnsmgr_xxx...')

# 获取域名列表
domains = client.get_domains()
print(f"Domains: {domains}")

# 添加 A 记录
result = client.add_record(1, 'api', 'A', '192.168.1.1')
print(f"Add record: {result}")
```

### Node.js 示例

```javascript
const axios = require('axios');

class DNSMgrClient {
  constructor(baseUrl, token) {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async getDomains() {
    const { data } = await this.client.get('/api/domains');
    return data;
  }

  async addRecord(domainId, record) {
    const { data } = await this.client.post(
      `/api/domains/${domainId}/records`,
      record
    );
    return data;
  }

  async updateRecord(domainId, recordId, updates) {
    const { data } = await this.client.put(
      `/api/domains/${domainId}/records/${recordId}`,
      updates
    );
    return data;
  }
}

// 使用示例
const client = new DNSMgrClient('https://dnsmgr.example.com', 'dnsmgr_xxx...');

async function main() {
  // 获取域名列表
  const domains = await client.getDomains();
  console.log('Domains:', domains);

  // 添加记录
  const result = await client.addRecord(1, {
    host: 'api',
    type: 'A',
    value: '192.168.1.1',
    ttl: 300
  });
  console.log('Add record:', result);
}

main().catch(console.error);
```

### cURL 示例

```bash
# 设置变量
BASE_URL="https://dnsmgr.example.com"
TOKEN="dnsmgr_xxx..."

# 获取域名列表
curl -X GET "${BASE_URL}/api/domains" \
  -H "Authorization: Bearer ${TOKEN}"

# 添加 A 记录
curl -X POST "${BASE_URL}/api/domains/1/records" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "host": "api",
    "type": "A",
    "value": "192.168.1.1",
    "ttl": 300
  }'

# 更新记录
curl -X PUT "${BASE_URL}/api/domains/1/records/123" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"value": "192.168.1.2"}'

# 删除记录
curl -X DELETE "${BASE_URL}/api/domains/1/records/123" \
  -H "Authorization: Bearer ${TOKEN}"
```

### GitHub Actions 示例

```yaml
name: Deploy and Update DNS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Update DNS Record
        run: |
          curl -X POST "${{ secrets.DNSMGR_URL }}/api/domains/${{ secrets.DOMAIN_ID }}/records" \
            -H "Authorization: Bearer ${{ secrets.DNSMGR_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d "{
              \"host\": \"deploy\",
              \"type\": \"A\",
              \"value\": \"${{ steps.deploy.outputs.ip }}\",
              \"ttl\": 300
            }"
```

---

## 最佳实践

### 1. Token 安全

```bash
# ✅ 正确：使用环境变量
export DNSMGR_TOKEN=dnsmgr_xxx...

# ❌ 错误：硬编码
const token = "dnsmgr_xxx..."
```

### 2. 错误处理

```python
def api_call_with_retry(func, max_retries=3):
    for i in range(max_retries):
        try:
            result = func()
            if result['code'] == 0:
                return result
            elif result['code'] == 401001:
                raise AuthenticationError("Token invalid")
            else:
                raise APIError(result['msg'])
        except requests.exceptions.RequestException as e:
            if i == max_retries - 1:
                raise
            time.sleep(2 ** i)  # 指数退避
```

### 3. 权限最小化

- 为不同用途创建独立的 Token
- 限制 Token 只能访问必要的域名
- 设置合理的过期时间

---

## 更新日志

### v1.1.0 (2025-01)

- ✨ 新增 API Token 认证方式
- ✨ 新增域名到期提醒
- ✨ 新增 Cloudflare Tunnels 管理
- ✨ 新增自定义背景图
- 🐛 修复多语言翻译完整性
- 🐛 修复数据库架构问题

### v1.0.0 (2024-12)

- 🎉 初始版本发布
- ✨ 支持 18+ DNS 服务商
- ✨ 完整的 RBAC 权限系统
- ✨ 审计日志功能
