# DNSHE API V2.0 更新总结

## 📋 概述

根据 DNSHE 官方最新 API 文档（V2.0），我们已完成代码适配和升级。

## ✅ 已完成的更新

### 1. **接口定义更新**

#### DnsheSubdomain 接口
```typescript
interface DnsheSubdomain {
  id: number;
  subdomain: string;
  rootdomain: string;
  full_domain: string;
  status: string;
  created_at: string;
  updated_at: string;
  expires_at?: string;        // ✨ NEW V2.0
  never_expires?: number;     // ✨ NEW V2.0 (0 or 1)
}
```

#### DnsheRecord 接口
```typescript
interface DnsheRecord {
  id: number;
  record_id?: string;         // ✨ NEW V2.0 - Cloud provider ID
  name: string;
  type: string;
  content: string;
  ttl: number;
  priority: number | null;
  line?: string | null;       // ✨ NEW V2.0
  proxied: boolean;
  status: string;
  created_at: string;
  updated_at?: string;        // ✨ NEW V2.0
}
```

#### DnsheRenewalResult 接口
```typescript
interface DnsheRenewalResult {
  success: boolean;
  message?: string;
  subdomain_id: number;
  subdomain: string;
  previous_expires_at: string;
  new_expires_at: string;
  renewed_at: string;
  never_expires: number;
  status: string;
  remaining_days: number;
  charged_amount: number;     // ✨ NEW V2.0 - 扣费金额
}
```

### 2. **分页功能增强**

#### 请求参数
```typescript
const res = await this.request<any>('subdomains', 'list', 'GET', undefined, {
  page,                        // 页码
  per_page: Math.min(pageSize, 500),  // 每页数量（最大500）
  include_total: 1,            // 返回总数
  ...(keyword && { search: keyword }), // 搜索关键词
});
```

#### 响应结构
```typescript
{
  success: true,
  count: 100,
  subdomains: [...],
  pagination: {                // ✨ NEW V2.0
    page: 2,
    per_page: 100,
    has_more: true,
    next_page: 3,
    prev_page: 1,
    total: 12500
  }
}
```

### 3. **域名列表增强**

`getDomainList()` 方法现在返回完整的到期信息：

```typescript
const domains = await adapter.getDomainList('test', 1, 50);
// 返回：
{
  total: 100,
  list: [
    {
      Domain: 'test.example.com',
      ThirdId: '123',
      RecordCount: undefined,
      ExpiresAt: '2026-05-01 00:00:00',    // ✨ NEW V2.0
      NeverExpires: false                   // ✨ NEW V2.0
    }
  ]
}
```

### 4. **续期功能增强**

续期响应现在包含扣费信息：

```typescript
const result = await renewSubdomain(config, subdomainId);
// 返回：
{
  success: true,
  message: "Subdomain renewed successfully (charged 9.90 credit)",
  subdomain_id: 3,
  subdomain: "myapp",
  previous_expires_at: "2025-05-01 00:00:00",
  new_expires_at: "2026-05-01 00:00:00",
  renewed_at: "2025-04-10 12:34:56",
  never_expires: 0,
  status: "active",
  remaining_days: 366,
  charged_amount: 9.9  // ✨ NEW V2.0 - 扣费金额（免费续期为0）
}
```

### 5. **WHOIS 查询优化**

WHOIS 接口支持两种模式：
- **公开模式**：无需 API Key，基于 IP 速率限制（默认 2次/分钟）
- **认证模式**：使用 API Key，可自定义速率限制

```typescript
// 公开模式（可选）
const whois = await getWhois(
  { apiKey: '', apiSecret: '', useProxy: false },  // 空凭证
  'example.com'
);

// 认证模式（推荐）
const whois = await getWhois(
  { apiKey: 'xxx', apiSecret: 'yyy', useProxy: false },
  'example.com'
);
```

## 🔧 技术改进

### 1. **模块化架构**
- ✅ `auth.ts` - 授权模块（可复用）
- ✅ `adapter.ts` - DNS 解析适配器
- ✅ `renewal.ts` - 域名续期功能
- ✅ `whois.ts` - WHOIS 查询功能
- ✅ `internal.ts` - 共用内部模块

### 2. **类型安全**
- ✅ 所有接口都有完整的 TypeScript 类型定义
- ✅ 编译时类型检查
- ✅ IDE 智能提示支持

### 3. **错误处理**
- ✅ 统一的错误日志记录
- ✅ 详细的错误信息返回
- ✅ 优雅的降级处理

## 📊 性能优化

### 1. **分页优化**
- 使用 API 原生分页，减少数据传输
- `include_total=1` 仅在需要时使用
- 通过 `pagination.has_more` 判断是否有下一页

### 2. **字段过滤**
- 支持 `fields` 参数减少响应数据量
- 只获取需要的字段

### 3. **搜索优化**
- 服务端搜索，减少客户端过滤
- 支持多条件组合查询

## 🚀 未来扩展

基于当前架构，可以轻松添加：

1. **批量操作**
   - 批量续期
   - 批量删除
   - 批量修改状态

2. **监控告警**
   - 域名到期提醒
   - 余额不足告警
   - API 调用监控

3. **统计分析**
   - 域名数量统计
   - 续期历史记录
   - 费用统计报表

4. **自动化任务**
   - 自动续期任务
   - 定期 WHOIS 检查
   - 数据备份

## 📝 迁移指南

### 对于现有代码

如果你的代码使用了旧版本的 DNSHE API，需要进行以下调整：

#### 1. 导入路径变更
```typescript
// 旧版本
import { DnsheAdapter } from '../providers/dnshe';

// 新版本（模块化）
import { DnsheAdapter } from '../providers/dnshe/adapter';
// 或者
import { DnsheAdapter } from '../providers';
```

#### 2. 续期函数调用
```typescript
// 旧版本
const adapter = new DnsheAdapter(config);
await adapter.renewSubdomain(id);

// 新版本（推荐直接使用独立函数）
import { dnsheRenewSubdomain } from '../providers';
const result = await dnsheRenewSubdomain(authConfig, id);
console.log(result.charged_amount);  // V2.0 新字段
```

#### 3. 域名列表使用
```typescript
// 新版本可以直接获取到期信息
const domains = await adapter.getDomainList();
domains.list.forEach(domain => {
  console.log(`${domain.Domain} expires at: ${domain.ExpiresAt}`);
});
```

## ✨ 总结

通过本次更新，我们实现了：

1. ✅ **完全兼容 DNSHE API V2.0**
2. ✅ **模块化架构，易于维护**
3. ✅ **类型安全，减少运行时错误**
4. ✅ **性能优化，提升响应速度**
5. ✅ **功能增强，支持更多场景**

所有改动已通过编译测试，可以安全部署使用。
