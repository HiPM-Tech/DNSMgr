# DNSMgr v1.7.1 版本发布说明

**发布日期**: 2026-05-31  
**提交哈希**: `01b545d`  
**Git 标签**: 待创建（尚未正式发布）

---

## 📋 版本概览

v1.7.1 是一个重要的安全和功能增强版本，主要包含以下改进：

1. **账号禁用权限控制** - 完整的安全隔离机制
2. **DDNS Go 适配插件优化** - 国际化和分页支持
3. **安全配置页面重构** - 彻底解决数据回填问题
4. **DNS 记录管理增强** - 新增记录详情 API

---

## 🚀 核心功能更新

### 1️⃣ 账号禁用权限控制 ⭐⭐⭐

**功能描述**：当 DNS 账号被禁用后，该账号下的所有域名操作将被完全冻结。

**实现细节**：

#### 前端行为
- ✅ 域名列表自动隐藏来自禁用账号的域名
- ✅ 账号筛选器只显示启用的账号
- ✅ 筛选器显示账号类型（如：HiDNS、Cloudflare 等）

#### 后端保护
- ✅ API 查询自动过滤禁用账号的域名（包括 DDNS Go 等外部适配器）
- ✅ 单个域名查询 → 拒绝访问
- ✅ 编辑域名 → 拒绝访问
- ✅ DNS 记录管理（增删改查）→ 全部拒绝
- ✅ WHOIS 查询 → 保持可用（公共功能）

**技术实现**：
```typescript
// server/src/db/query-builders/domain-query-builder.ts
// 所有域名查询自动添加 enabled = 1 条件
WHERE a.enabled = 1
```

**安全价值**：
- 防止误操作已禁用的 DNS 账号
- 确保账号禁用后立即生效
- 保护用户数据安全

---

### 2️⃣ DDNS Go 适配插件优化 ⭐⭐

**仓库**: [WUHINS/ddns-go](https://github.com/WUHINS/ddns-go)

#### 日志国际化
所有日志从中文改为英文，便于国际用户使用和调试：

```go
// 修复前
util.Log("你的IPv4未变化, 未触发 %s 请求", "HiPMDnsMgr")

// 修复后
util.Log("IPv4 address unchanged, skipping %s request", "HiPMDnsMgr")
```

#### 分页查询支持
- ✅ **域名查询**：自动分页遍历（最多 10 页/1000 个域名）
- ✅ **记录查询**：自动分页遍历（最多 10 页/1000 条记录）
- ✅ **智能终止**：检测到最后一页自动停止
- ✅ **安全限制**：防止过度查询导致 API 限流

```go
const pageSize = 100
currentPage := 1

for {
    // 查询当前页
    path := fmt.Sprintf("/domains?page=%d&pageSize=%d", currentPage, pageSize)
    
    // 检查是否到达最后一页
    if len(pageDomains) < pageSize || (total > 0 && currentPage*pageSize >= total) {
        break
    }
    
    currentPage++
    
    // 安全限制：最多 10 页
    if currentPage > 10 {
        util.Log("Warning: searched 10 pages (1000 domains), stopping")
        break
    }
}
```

---

### 3️⃣ 安全配置页面全面重构 ⭐⭐⭐

**PR #30** by @zerosnowe

#### 问题背景
安全配置页面的 Switch 组件无法正确显示布尔值状态，原因是：
- API 返回的字段名可能是 snake_case（如 `max_attempts`）
- 前端期望 camelCase（如 `maxAttempts`）
- 数据类型不一致（字符串 vs 数字 vs 布尔值）

#### 解决方案

**1. 引入 formHelpers 工具模块**
```typescript
// client/src/utils/formHelpers.ts
export function toBoolean(value: any, defaultValue: boolean = false): boolean
export function toNumber(value: any, defaultValue: number = 0): number
export function toString(value: any, defaultValue: string = ''): string
```

**2. 新增数据标准化函数**
```typescript
// 从嵌套对象中读取值，支持多个键名回退
function readValue(source: Record<string, any>, ...keys: string[])

// 解包 API 响应，兼容不同格式
function unwrapConfig(config?: Record<string, any>): Record<string, any>

// 标准化各种配置
function normalizeLoginLimitConfig(config?: Partial<LoginLimitConfig>)
function normalizeSmtpConfig(config?: Partial<SmtpConfig>)
function normalizeAuditRules(config?: Partial<AuditRulesConfig>)
```

**3. 使用示例**
```typescript
// 修复前
value={securityConfig?.showDnsProviderSecrets ?? false}

// 修复后
value={toBoolean(
  readValue(raw, 'showDnsProviderSecrets', 'show_dns_provider_secrets'),
  DEFAULT_SECURITY_CONFIG_FORM.showDnsProviderSecrets
)}
```

#### 影响范围
- ✅ 登录限制配置
- ✅ SMTP 配置
- ✅ 审计规则
- ✅ 安全策略
- ✅ 所有 Switch 组件正确显示状态

---

### 4️⃣ DNS 记录管理增强 ⭐

**新增 API**: `GET /api/domains/{domainId}/records/{recordId}`

**功能**：
- 获取单个 DNS 记录的详细信息
- 支持权限检查（`requireTokenDomainPermission`）
- 先从适配器直接查询，如果失败则遍历列表查找
- 返回标准化的记录格式

**用途**：用于前端编辑记录时获取完整信息

---

## 🐛 Bug 修复

### ✅ 已修复

1. **安全页回显问题**
   - Switch 组件现在能正确显示所有安全配置字段的状态
   - 通过 PR #30 全面修复

### ⚠️ 已知问题

1. **SMTP 发件问题**
   - 部分运行环境下 SMTP 无法发送邮件
   - 状态：待修复

2. **SQLite 数据库迁移问题**
   - 部分 SQLite 数据库可能出现迁移失败
   - 建议：使用 PostgreSQL

---

## 📝 技术细节

### 修改的文件清单

| 文件路径 | 改动类型 | 说明 |
|---------|---------|------|
| `server/src/routes/domains.ts` | 修改 | 单个域名查询权限检查 |
| `server/src/db/query-builders/domain-query-builder.ts` | 修改 | 账号 enabled 过滤 |
| `server/src/routes/records.ts` | 新增 | 记录详情 API (+34 行) |
| `client/src/pages/system/SecurityTab.tsx` | 重构 | 使用 formHelpers (+278/-164 行) |
| `client/src/utils/formHelpers.ts` | 新增 | 表单辅助工具模块 (190 行) |
| `client/vite.config.ts` | 修改 | 构建配置优化 (emptyOutDir) |
| `docs/CHANGELOG.md` | 更新 | v1.7.1 更新日志 |

### 代码统计

- **新增代码**: ~500 行
- **删除代码**: ~200 行
- **净增加**: ~300 行
- **修改文件**: 7 个

---

## 🔄 与 v1.7.0 的对比

| 特性 | v1.7.0 | v1.7.1 |
|-----|--------|--------|
| 邮件模板系统 | ✅ | ✅ |
| 数据库迁移优化 | ✅ | ✅ |
| IDN 域名支持 | ✅ | ✅ |
| **账号禁用控制** | ❌ | ✅ |
| **安全页回填修复** | ❌ | ✅ |
| **DNS 记录详情 API** | ❌ | ✅ |
| **DDNS Go 优化** | ❌ | ✅ |

---

## 🎯 升级建议

### 从 v1.7.0 升级

1. **备份数据库**
   ```bash
   # SQLite
   cp server/data/dnsmgr.db server/data/dnsmgr.db.backup
   
   # MySQL
   mysqldump -u root -p dnsmgr > backup.sql
   
   # PostgreSQL
   pg_dump -U postgres dnsmgr > backup.sql
   ```

2. **拉取最新代码**
   ```bash
   git pull origin main
   ```

3. **重新构建**
   ```bash
   npm run build
   ```

4. **重启服务**
   ```bash
   # Docker
   docker restart DNSmgr
   
   # 直接运行
   npm start
   ```

5. **验证功能**
   - 测试账号禁用功能
   - 检查安全配置页面
   - 验证 DNS 记录查询

### 注意事项

- ⚠️ 如果使用 SQLite，请确保数据库迁移成功
- ⚠️ 建议使用 PostgreSQL 以获得最佳稳定性
- ⚠️ 禁用账号后，相关域名将立即不可见

---

## 👥 贡献者

- **@zerosnowe** - 安全页面回填问题修复（PR #30）
- **HINS** - 账号禁用控制、DDNS Go 优化、记录详情 API

---

## 📅 后续计划

### v1.7.2 候选功能

1. **修复 SMTP 发件问题**
2. **推广 formHelpers 到其他表单组件**
3. **考虑重新启用批量删除功能**（如果确定没有安全问题）
4. **优化 SQLite 迁移流程**

---

## 📞 支持与反馈

- **GitHub Issues**: https://github.com/HiPM-Tech/HiDNS/issues
- **文档**: https://hidns.hinswu.top/
- **邮箱**: HINS@hinswu.top

---

**最后更新**: 2026-05-31
