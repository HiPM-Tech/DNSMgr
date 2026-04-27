# Example Provider - 示例提供商模板

这是一个完整的 DNS 提供商模块化示例，展示了如何实现一个新的 DNS 提供商适配器。

## 📁 文件结构

```
_example/
├── adapter.ts    # DNS 记录管理适配器（主要业务逻辑）
├── auth.ts       # 认证模块（API 凭证处理）
├── index.ts      # 模块导出
└── README.md     # 说明文档
```

## 🚀 快速开始

### 1. 复制模板文件夹

```bash
cp -r _example yourprovider
```

### 2. 重命名类和接口

在所有文件中替换：
- `Example` → `YourProvider`（如 Cloudflare、Aliyun）
- `example` → `yourprovider`（小写，用于函数名前缀）

### 3. 实现认证逻辑 (auth.ts)

根据你的提供商 API 文档，修改以下内容：

#### 配置接口
```typescript
export interface YourProviderAuthConfig {
  apiKey: string;        // 根据实际 API 要求调整
  apiSecret?: string;    // 可选字段
  useProxy?: boolean;
}
```

#### 认证方式选择

**方式 1: Bearer Token**
```typescript
export function buildAuthHeaders(config: YourProviderAuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiToken}`,
  };
}
```

**方式 2: API Key + Secret**
```typescript
export function buildAuthHeaders(config: YourProviderAuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': config.apiKey,
    'X-API-Secret': config.apiSecret,
  };
}
```

**方式 3: 签名认证**
```typescript
import crypto from 'crypto';

export function generateSignature(params: Record<string, string>, secret: string): string {
  const sortedKeys = Object.keys(params).sort();
  const queryString = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}
```

**方式 4: 查询参数认证**
```typescript
export async function authenticatedRequest(
  url: string,
  config: YourProviderAuthConfig,
  options: RequestInit = {}
): Promise<Response> {
  const urlObj = new URL(url);
  urlObj.searchParams.set('api_key', config.apiKey);
  urlObj.searchParams.set('timestamp', String(Math.floor(Date.now() / 1000)));
  
  return fetchWithFallback(urlObj.toString(), options, config.useProxy ?? false, 'YourProvider');
}
```

### 4. 实现适配器逻辑 (adapter.ts)

#### 修改配置接口
```typescript
interface YourProviderConfig extends YourProviderAuthConfig {
  domain?: string;
  domainId?: string;
  baseUrl?: string;  // 如果支持自定义 API 端点
}
```

#### 修改 API 基础 URL
```typescript
private baseUrl = 'https://api.yourprovider.com/v1';
```

#### 实现必需方法

所有方法都已有示例实现，你需要根据提供商 API 文档调整：

1. **getDomainList** - 获取域名列表
2. **getDomainRecords** - 获取解析记录列表
3. **addDomainRecord** - 添加解析记录
4. **updateDomainRecord** - 更新解析记录
5. **deleteDomainRecord** - 删除解析记录
6. **mapRecord** - 映射记录格式（重要！）
7. **normalizeLine** - 线路标准化

### 5. 更新导出 (index.ts)

确保导出的名称与你的提供商名称一致：

```typescript
export { YourProviderAdapter } from './adapter';
export {
  buildAuthHeaders as yourproviderBuildAuthHeaders,
  authenticatedRequest as yourproviderAuthenticatedRequest,
  validateCredentials as yourproviderValidateCredentials,
  type YourProviderAuthConfig,
} from './auth';
```

### 6. 注册提供商

在 `providers/index.ts` 中添加导出：

```typescript
export { YourProviderAdapter } from './yourprovider';
```

在 `DnsHelper.ts` 中注册（如果需要）：

```typescript
case 'yourprovider':
  return new YourProviderAdapter(config);
```

## 📝 关键注意事项

### 1. 记录映射 (mapRecord)

这是最重要的方法，需要将提供商的返回格式转换为统一的 `DnsRecord` 格式：

```typescript
private mapRecord(source: Dict): DnsRecord {
  return {
    RecordId: safeString(source.id),           // 记录 ID
    Domain: this.config.domain || '',          // 域名
    Name: normalizeRrName(safeString(source.name)),  // 主机记录
    Type: safeString(source.type),             // 记录类型
    Value: safeString(source.value),           // 记录值
    Line: safeString(source.line) || 'default', // 线路
    TTL: toNumber(source.ttl, 600),            // TTL
    MX: toNumber(source.priority, 0),          // MX 优先级
    Status: source.status === 'active' ? 1 : 0, // 状态
    Weight: source.weight !== undefined ? toNumber(source.weight, 0) : undefined,
    Remark: safeString(source.remark) || undefined,
    UpdateTime: safeString(source.updated_at) || undefined,
  };
}
```

### 2. 线路标准化 (normalizeLine)

将内部线路标识转换为提供商要求的格式：

```typescript
private normalizeLine(line?: string): string {
  const lineMap: Record<string, string> = {
    '0': 'default',      // 默认线路
    '10=0': 'telecom',   // 电信
    '10=1': 'unicom',    // 联通
    '10=3': 'mobile',    // 移动
  };
  return lineMap[line || '0'] || 'default';
}
```

### 3. 错误处理

所有方法都应该捕获错误并设置 `this.error`：

```typescript
try {
  // API 调用
} catch (e) {
  this.error = e instanceof Error ? e.message : String(e);
  return null; // 或 false，根据返回类型
}
```

### 4. 分页处理

如果提供商 API 支持分页，确保正确处理：

```typescript
async getDomainRecords(page = 1, pageSize = 100, ...): Promise<PageResult<DnsRecord>> {
  const data = await this.request<{ records: Dict[]; total: number }>(
    'GET',
    '/records',
    { page, limit: pageSize }
  );
  
  return { 
    total: data.total || list.length, 
    list: data.records.map(row => this.mapRecord(row))
  };
}
```

## 🔍 调试技巧

### 1. 启用日志

```typescript
log.providerRequest('YourProvider', method, url, body);
```

### 2. 测试凭证验证

```bash
# 使用 validateCredentials 函数测试
node -e "const { validateCredentials } = require('./dist/lib/dns/providers/yourprovider/auth'); validateCredentials({ apiKey: 'test', apiSecret: 'test' }).then(console.log);"
```

### 3. 检查 API 响应

在 `request` 方法中添加日志：

```typescript
log.info('YourProvider', 'Response:', JSON.stringify(data, null, 2));
```

## 📚 参考示例

查看现有提供商的实现作为参考：

- **Cloudflare**: 简单的 Bearer Token 认证
- **Aliyun**: 复杂的签名认证
- **DNSHE**: 查询参数认证 + 额外功能（续期、WHOIS）
- **CaihongDNS**: MD5 签名认证

## ✅ 完成检查清单

- [ ] auth.ts 中的配置接口与实际 API 匹配
- [ ] buildAuthHeaders 正确构建认证头
- [ ] authenticatedRequest 正确处理代理
- [ ] validateCredentials 能正确验证凭证
- [ ] adapter.ts 中的所有方法都已实现
- [ ] mapRecord 正确映射所有字段
- [ ] normalizeLine 处理所有线路
- [ ] 错误处理完善
- [ ] 日志记录完整
- [ ] TypeScript 编译通过
- [ ] 在 providers/index.ts 中导出
- [ ] 在 DnsHelper.ts 中注册（如需要）

## 🎯 下一步

完成实现后：

1. 运行 `npm run build` 确保编译通过
2. 在开发环境中测试基本功能
3. 测试各种记录类型（A, CNAME, MX, TXT 等）
4. 测试多线路解析（如果支持）
5. 提交代码并创建 Pull Request

---

**祝你开发顺利！** 🚀
