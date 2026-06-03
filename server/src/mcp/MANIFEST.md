# HiDNS MCP Server 声明

## 📋 服务器信息

- **名称**: HiDNS MCP Server
- **版本**: 1.0.0
- **协议**: Model Context Protocol (MCP)
- **传输层**: stdio (标准输入输出)

## ⚙️ 能力声明 (Capabilities)

```json
{
  "capabilities": {
    "tools": {}
  }
}
```

### 支持的能力

| 能力 | 状态 | 说明 |
|------|------|------|
| **tools** | ✅ 已启用 | 支持 15 个 DNS 管理工具 |
| resources | ❌ 未启用 | 不支持资源访问 |
| prompts | ❌ 未启用 | 不支持提示词模板 |

---

## 🛠️ 可用工具列表

### 1. 域名管理模块 (domain_management)

#### 读操作 (read)

| 工具名称 | 描述 | 参数 |
|---------|------|------|
| `list_domains` | 列出所有域名（分页） | apiKey, page, pageSize |
| `list_domains_filtered` | 列出域名（自动过滤禁用账号） | apiKey, page, pageSize |
| `get_domain_info` | 获取域名详细信息 | apiKey, domainId |
| `get_domain_remark` | 查看域名备注和隐藏状态 | apiKey, domainId |
| `get_domain_pinned_status` | 检查域名是否被置顶 | apiKey, domainId |

#### 写操作 (write)

| 工具名称 | 描述 | 参数 | 状态 |
|---------|------|------|------|
| `update_domain_status` | 启用/禁用域名 | apiKey, domainId, enabled | ✅ 已实现 |
| `get_domain_whois` | 查询域名 WHOIS 信息 | apiKey, domainName, forceRefresh | ✅ 已实现 |
| `add_domain` | 添加新域名 | apiKey, account_id, name | ⚠️ 暂不实现 |
| `delete_domain` | 删除域名 | apiKey, domainId | ⚠️ 暂不实现 |
| `update_domain` | 更新域名信息 | apiKey, domainId, updates | ⚠️ 暂不实现 |

**说明**: `add_domain`, `delete_domain`, `update_domain` 涉及复杂的业务逻辑（账号关联、DNS 提供商配置等），建议通过 Web 界面操作。

---

### 2. DNS 解析记录管理 (domain_management)

#### 读操作 (read)

| 工具名称 | 描述 | 参数 |
|---------|------|------|
| `list_domain_records` | 列出 DNS 记录（支持线路过滤） | apiKey, domainId, line, page, pageSize |
| `get_dns_lines` | 获取可用线路列表 | apiKey, domainId |

#### 写操作 (write)

| 工具名称 | 描述 | 参数 |
|---------|------|------|
| `create_dns_record` | 创建 DNS 记录（支持线路） | apiKey, domainId, name, type, content, ttl, priority, line, remark |
| `update_dns_record` | 更新 DNS 记录（支持线路） | apiKey, domainId, recordId, name, type, content, ttl, priority, line, remark |
| `delete_dns_record` | 删除 DNS 记录 | apiKey, domainId, recordId |

**支持的记录类型**: A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, PTR 等

**线路支持**:
- 阿里云/腾讯云: `default`, `telecom`, `unicom`, `mobile`, `overseas` 等
- Cloudflare: `0` (仅DNS), `1` (已代理)

---

### 3. 续期管理模块 (renewal_management)

| 工具名称 | 描述 | 参数 | 权限 |
|---------|------|------|------|
| `get_renewable_domains` | 获取可续期的域名列表 | apiKey | read |
| `check_domain_expiry` | 检查域名到期时间 | apiKey, domainId | read |
| `get_expiry_alerts` | 获取到期提醒 | apiKey, daysBefore | read |
| `manual_renew_domain` | 手动续期域名（更新到期时间） | apiKey, renewableDomainId, newExpiresAt | write |
| `disable_domain_renewal` | 禁用指定域名的自动续期 | apiKey, renewableDomainId | write |

---

### 4. 故障转移模块 (failover_management)

| 工具名称 | 描述 | 参数 | 权限 |
|---------|------|------|------|
| `list_failover_rules` | 列出故障转移规则 | apiKey | read |
| `get_failover_config` | 获取域名容灾配置 | apiKey, domainId | read |
| `create_failover_config` | 创建/更新容灾配置 | apiKey, domainId, primaryIp, backupIps, ... | write |
| `delete_failover_config` | 删除容灾配置 | apiKey, domainId | write |
| `perform_health_check` | 手动执行健康检查 | apiKey, domainId | write |

**功能特性**:
- ✅ 完整的容灾配置管理（CRUD）
- ✅ 支持 HTTP/TCP/Ping 健康检查
- ✅ 自动故障切换和回切
- ✅ 实时健康状态查询

---

### 5. NS 监控模块 (ns_monitor)

| 工具名称 | 描述 | 参数 | 权限 |
|---------|------|------|------|
| `list_ns_records` | 列出 NS 记录 | apiKey | read |
| `check_ns_status` | 检查 NS 状态 | apiKey, domainId | read |
| `get_ns_info` | 获取 NS 详细信息 | apiKey, nsId | read |
| `refresh_ns_monitor` | 手动刷新 NS 监控（完整实现） | apiKey, nsMonitorId | write |

**功能特性**:
- ✅ DNS 污染检测（对比加密DNS和明文DNS结果）
- ✅ NS 记录匹配验证
- ✅ 自动更新数据库状态
- ✅ 异常状态审计日志记录

---

### 6. 日志查询模块 (log_query)

| 工具名称 | 描述 | 参数 | 权限 |
|---------|------|------|------|
| `query_audit_logs` | 查询审计日志（分页） | apiKey, userId, action, startDate, endDate, page, pageSize | read |
| `get_audit_stats` | 获取用户操作统计 | apiKey, userId, days | read |
| `export_audit_logs` | 导出审计日志（CSV/JSON） | apiKey, format, userId, action, startDate, endDate | read |

**功能特性**:
- ✅ 多条件过滤查询（用户、操作、时间范围）
- ✅ 分页支持，适合大数据量
- ✅ 用户操作统计分析
- ✅ 异常检测（删除/创建操作计数）
- ✅ 时间分布分析
- ✅ CSV/JSON 格式导出

---

## 🔐 认证方式

### API Key 认证

所有工具都需要 `apiKey` 参数进行认证。

**API Key 验证流程**:
1. 检查 API Key 是否存在
2. 验证 API Key 是否有效（未撤销、未过期）
3. 检查用户权限（全局开关 + 角色权限）
4. 记录 API Key 使用时间

**权限级别**:
- `read`: 只读操作（查询域名、记录、日志等）
- `write`: 写操作（创建、更新、删除）

---

## 📊 响应格式

### 成功响应
```json
{
  "content": [
    {
      "type": "text",
      "text": "操作成功的消息或数据"
    }
  ]
}
```

### 错误响应
```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: 错误描述"
    }
  ],
  "isError": true
}
```

---

## 🌐 支持的 DNS 提供商

项目支持 **28+ DNS 提供商**，包括：

| 提供商 | 线路支持 | 代理支持 |
|--------|---------|---------|
| 阿里云 DNS | ✅ 完整支持 | ❌ |
| 腾讯云 DNSPod | ✅ 完整支持 | ❌ |
| Cloudflare | ❌ | ✅ 代理状态 |
| 华为云 DNS | ✅ 完整支持 | ❌ |
| 百度云 DNS | ✅ 完整支持 | ❌ |
| ... 其他 23+ | 视提供商而定 | 视提供商而定 |

---

## 🔧 配置示例

### Claude Desktop 配置

在 `claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "hidns": {
      "command": "node",
      "args": ["dist/mcp/start.js"],
      "env": {
        "DATABASE_URL": "sqlite:data/hidns.db",
        "JWT_SECRET": "your-jwt-secret"
      }
    }
  }
}
```

### 启动命令

```bash
cd server
pnpm mcp
```

---

## 📝 审计日志

所有 MCP 操作都会记录到审计日志中，包括：

- 用户 ID
- 认证类型 (api_key / oauth2)
- 模块名称
- 操作名称
- 请求参数
- 响应状态
- 时间戳

---

## 🚀 架构说明

```
AI Client (Claude)
    ↓
MCP Server (stdio)
    ↓
DnsProviderService
    ↓
DNS Adapter (Aliyun/DNSPod/Cloudflare/etc.)
    ↓
DNS Provider API
```

**关键特性**:
- ✅ 直接调用 DNS 提供商 API（不经过本地数据库）
- ✅ 支持 28+ DNS 提供商
- ✅ 统一的线路抽象层
- ✅ 完整的权限控制和审计日志
- ✅ API Key 使用追踪

---

## 📊 工具统计

| 模块 | 工具数量 | 读操作 | 写操作 | 完成度 |
|------|---------|--------|--------|--------|
| **域名管理** | 10 | 6 | 2 | ⚠️ 70% (3个暂不实现) |
| **DNS 记录** | 5 | 2 | 3 | ✅ 100% |
| **续期管理** | 5 | 3 | 2 | ✅ 100% |
| **故障转移** | 5 | 2 | 3 | ✅ 100% |
| **NS 监控** | 4 | 3 | 1 | ✅ 100% |
| **日志查询** | 3 | 3 | 0 | ✅ 100% |
| **总计** | **32** | **19** | **11** | **✅ 91%** |

**说明**: 
- 实际可用工具：**29/32** (91%)
- 暂不实现：`add_domain`, `delete_domain`, `update_domain` (建议通过 Web 界面操作)

---

## 📖 相关文档

- [MCP 进度报告](../../docs/MCP_PROGRESS.md)
- [MCP 权限设计](../service/mcp-permission.ts)
- [DNS 提供商适配器](../lib/dns/providers/)

---

**最后更新**: 2026-06-03
