# DNS 提供商模块化迁移指南

## 📋 概述

本文档说明如何将单文件的 DNS 提供商重构为模块化结构。

## 🎯 为什么要模块化？

### 优势
1. **职责分离** - 授权、解析、特殊功能分开管理
2. **代码复用** - auth 模块可被多个功能复用
3. **易于扩展** - 新功能作为独立模块添加
4. **便于测试** - 每个模块可独立测试
5. **维护性好** - 修改一个模块不影响其他模块

### 适用场景
- ✅ **复杂提供商**（Cloudflare、Aliyun、DNSPod）- 推荐模块化
- ⚠️ **中等复杂度**（Huawei、Baidu、Tencent）- 可选模块化
- ❌ **简单提供商**（Namesilo、VPS8）- 保持单文件即可

## 📁 目录结构

### 模块化结构
```
provider-name/
├── index.ts          # 主导出文件
├── adapter.ts        # DNS 解析适配器（可选）
├── auth.ts           # 授权模块（必须）
├── renewal.ts        # 域名续期（可选）
├── whois.ts          # WHOIS 查询（可选）
└── README.md         # 模块说明（可选）
```

### 单文件结构（保持不变）
```
provider-name.ts      # 单个文件包含所有功能
```

## 🔄 迁移步骤

### Step 1: 创建目录结构

```bash
mkdir provider-name
cd provider-name
```

### Step 2: 创建 index.ts

```typescript
/**
 * Provider Name Module
 */

// Main adapter for DNS record operations
export { ProviderNameAdapter } from './adapter';

// Optional: Export additional modules if needed
// export { buildAuthHeaders, validateCredentials } from './auth';
// export { renewDomain } from './renewal';
```

### Step 3: 提取 adapter.ts

从原文件中提取 `Adapter` 类：

1. **复制整个 Adapter 类**到 `adapter.ts`
2. **更新导入路径**使用内部模块：

```typescript
// 旧方式
import { DnsAdapter, DnsRecord } from '../DnsInterface';
import { log } from '../../logger';
import { fetchWithFallback } from '../../proxy-http';
import { safeString, toNumber } from './common';

// 新方式 - 使用内部模块
import { 
  DnsAdapter, 
  DnsRecord,
  log,
  fetchWithFallback,
  safeString,
  toNumber,
} from '../internal';
```

3. **保留所有业务逻辑不变**

### Step 4: （可选）提取 auth.ts

如果提供商有复杂的认证逻辑：

```typescript
import { fetchWithFallback } from '../internal';

export interface ProviderAuthConfig {
  apiKey: string;
  apiSecret?: string;
  apiToken?: string;
  useProxy?: boolean;
}

export function buildAuthHeaders(config: ProviderAuthConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  
  if (config.apiToken) {
    headers['Authorization'] = `Bearer ${config.apiToken}`;
  } else if (config.apiKey && config.apiSecret) {
    headers['X-API-Key'] = config.apiKey;
    headers['X-API-Secret'] = config.apiSecret;
  }
  
  return headers;
}

export async function validateCredentials(config: ProviderAuthConfig): Promise<boolean> {
  // 实现验证逻辑
  return true;
}
```

### Step 5: （可选）提取特殊功能模块

例如续期、WHOIS 等：

```typescript
// renewal.ts
import { log } from '../internal';
import { authenticatedRequest, ProviderAuthConfig } from './auth';

export interface RenewalResult {
  success: boolean;
  newExpiryDate: string;
}

export async function renewDomain(
  config: ProviderAuthConfig,
  domainId: string
): Promise<RenewalResult | null> {
  // 实现续期逻辑
  return null;
}
```

### Step 6: 更新 providers/index.ts

```typescript
// 旧方式
export { ProviderNameAdapter } from './provider-name';

// 新方式 - 如果需要导出额外功能
export { ProviderNameAdapter } from './provider-name';
export { 
  buildAuthHeaders as providerBuildAuthHeaders,
  validateCredentials as providerValidateCredentials,
} from './provider-name';
```

### Step 7: 测试编译

```bash
npm run build
```

确保没有 TypeScript 错误。

### Step 8: （可选）删除旧文件

确认新模块工作正常后，可以删除旧的单文件：

```bash
rm ../provider-name.ts
```

## 📝 实际示例

### Cloudflare 迁移（已完成）

**原文件**: `cloudflare.ts` (455 行)

**新结构**:
```
cloudflare/
├── index.ts      # 10 行 - 导出
└── adapter.ts    # 460 行 - 完整适配器
```

**关键变更**:
- 导入路径从相对路径改为 `../internal`
- 保持所有业务逻辑不变
- 支持额外的 Tunnel 管理功能

### DNSHE 迁移（已完成）

**原文件**: `dnshe.ts` (466 行)

**新结构**:
```
dnshe/
├── index.ts      # 33 行 - 导出所有模块
├── adapter.ts    # 445 行 - DNS 解析
├── auth.ts       # 65 行 - 授权
├── renewal.ts    # 58 行 - 续期
└── whois.ts      # 54 行 - WHOIS
```

**关键变更**:
- 授权逻辑独立，可被 renewal 和 whois 复用
- 续期和 WHOIS 作为独立函数导出
- 支持直接在路由层调用，无需通过 adapter

## 🎨 最佳实践

### 1. 何时模块化？

✅ **应该模块化**：
- 提供商有 3+ 个独立功能（DNS、续期、WHOIS、监控等）
- 认证逻辑复杂（多种认证方式）
- 需要频繁添加新功能
- 代码超过 300 行

❌ **保持单文件**：
- 只有基本 DNS 功能
- 认证简单（仅 API Key）
- 代码少于 200 行
- 不太可能扩展新功能

### 2. 命名规范

- **Adapter 类**: `{Provider}Adapter` (e.g., `CloudflareAdapter`)
- **配置文件**: `{Provider}Config`
- **结果接口**: `{Feature}Result` (e.g., `RenewalResult`)
- **函数名**: 动词开头 (e.g., `renewDomain`, `getWhois`)

### 3. 导入策略

始终使用内部模块简化导入：

```typescript
// ✅ 推荐
import { log, fetchWithFallback, safeString } from '../internal';

// ❌ 不推荐
import { log } from '../../logger';
import { fetchWithFallback } from '../../proxy-http';
import { safeString } from './common';
```

### 4. 错误处理

保持一致的错误处理模式：

```typescript
try {
  const result = await someOperation();
  if (!result) {
    this.error = 'Operation failed';
    log.providerError('Provider', { message: this.error });
    return null;
  }
  return result;
} catch (error) {
  this.error = error instanceof Error ? error.message : String(error);
  log.providerError('Provider', { error: this.error });
  return null;
}
```

## 🔧 批量迁移脚本（未来）

可以创建自动化脚本来批量迁移简单提供商：

```typescript
// scripts/migrate-provider.ts
// TODO: 实现自动化迁移脚本
```

## 📊 迁移优先级

### P0 - 高优先级（立即迁移）
- [x] DNSHE - 已完成
- [x] Cloudflare - 已完成
- [ ] Aliyun - 建议迁移（复杂度高）
- [ ] DNSPod - 建议迁移（使用广泛）

### P1 - 中优先级（按需迁移）
- [ ] Huawei
- [ ] Baidu
- [ ] Tencent
- [ ] Rainyun

### P2 - 低优先级（保持现状）
- Namesilo
- VPS8
- Spaceship
- PowerDNS
- 其他简单提供商

## ⚠️ 注意事项

1. **向后兼容** - 确保导出名称不变，不影响现有代码
2. **测试覆盖** - 迁移后运行所有测试
3. **文档更新** - 更新 README 和 API 文档
4. **渐进式迁移** - 不要一次性迁移所有提供商
5. **回滚计划** - 保留旧文件直到确认新模块稳定

## 🚀 下一步

1. 根据需要选择要迁移的提供商
2. 按照本指南逐步迁移
3. 测试并验证功能
4. 提交 PR 并记录变更

---

**最后更新**: 2026-04-27  
**维护者**: DNSMgr Team
