# DNS 工具模块

统一的 DNS 域名处理工具模块，提供 IDN（国际化域名）转换、验证和规范化功能。

## 导入方式

```typescript
// 推荐：按需导入
import { normalizeDomain, toUnicode, isValidDomain } from '../utils/dns';

// 或者：全部导入
import * as dnsUtils from '../utils/dns';
```

## 核心功能

### 1. IDN 转换

#### `toPunycode(domain: string): string`
将 Unicode 域名转换为 Punycode（ASCII 表示）

```typescript
toPunycode("例子.测试") // "xn--fsq092h.xn--0zwm56d"
toPunycode("中国.com")   // "xn--fiqs8s.com"
```

#### `toUnicode(domain: string): string`
将 Punycode 域名转换为 Unicode

```typescript
toUnicode("xn--fsq092h.xn--0zwm56d") // "例子.测试"
toUnicode("xn--fiqs8s.com")           // "中国.com"
```

### 2. 域名检测

#### `isUnicodeDomain(domain: string): boolean`
检查域名是否包含 Unicode 字符

```typescript
isUnicodeDomain("中国.com")   // true
isUnicodeDomain("example.com") // false
```

#### `isPunycodeDomain(domain: string): boolean`
检查域名是否为 Punycode 格式

```typescript
isPunycodeDomain("xn--fiqs8s.com") // true
isPunycodeDomain("中国.com")        // false
```

### 3. 域名规范化

#### `normalizeDomain(domain: string): string`
标准化域名：去除空格、转小写、Unicode 转 Punycode

**这是最常用的函数！** 用于数据库存储和 API 查询。

```typescript
normalizeDomain(" 中国.COM ") // "xn--fiqs8s.com"
normalizeDomain("Example.Com") // "example.com"
```

#### `sanitizeDomain(domain: string): string`
清理域名输入：去除空格、转小写（不转换 Punycode）

```typescript
sanitizeDomain(" Example.COM ") // "example.com"
```

### 4. 域名显示

#### `getDisplayDomain(domain: string, preferUnicode = true): string`
获取域名的显示名称

```typescript
// Session 认证（网页访问）- 显示 Unicode
getDisplayDomain("xn--fiqs8s.com", true) // "中国.com"

// Token 认证（API 调用）- 保持 Punycode
getDisplayDomain("xn--fiqs8s.com", false) // "xn--fiqs8s.com"
```

### 5. 域名比较

#### `areDomainsEqual(domain1: string, domain2: string): boolean`
比较两个域名是否相同（自动处理 Unicode/Punycode）

```typescript
areDomainsEqual("中国.com", "xn--fiqs8s.com") // true
areDomainsEqual("Example.COM", "example.com") // true
```

### 6. 域名提取

#### `getRootDomain(domain: string): string`
提取根域名

```typescript
getRootDomain("www.example.com")    // "example.com"
getRootDomain("blog.中国.com")      // "xn--fiqs8s.com"
```

#### `extractSubdomain(fullDomain: string, rootDomain: string)`
从完整域名中提取子域名

```typescript
extractSubdomain("www.example.com", "example.com")
// { subdomain: "www", domain: "example.com" }

extractSubdomain("中国.com", "中国.com")
// { subdomain: "@", domain: "xn--fiqs8s.com" }
```

### 7. 域名验证

#### `isValidDomain(domain: string): boolean`
验证域名格式（支持 ASCII、Unicode、Punycode）

```typescript
isValidDomain("example.com")        // true
isValidDomain("中国.com")            // true
isValidDomain("xn--fiqs8s.com")     // true
isValidDomain("")                   // false
isValidDomain("invalid..com")       // false
```

#### `isValidSubdomain(subdomain: string): boolean`
验证子域名格式（支持下划线前缀，如 `_dmarc`）

```typescript
isValidSubdomain("www")              // true
isValidSubdomain("_dmarc")           // true
isValidSubdomain("_acme-challenge")  // true
isValidSubdomain("@")                // true (根域名)
isValidSubdomain("")                 // false
```

#### `isValidHostname(hostname: string): boolean`
验证主机名格式（用于 CNAME、MX、NS 等记录值）

```typescript
isValidHostname("mail.example.com")      // true
isValidHostname("_dmarc.example.com")    // true
isValidHostname("中国.com")               // true
isValidHostname("*")                     // true (通配符)
```

## 使用场景

### 后端 API 接收域名参数

```typescript
router.post('/domains', async (req, res) => {
  const { domain_name } = req.body;
  
  // ✅ 标准化为 Punycode 用于数据库查询
  const normalizedDomain = normalizeDomain(domain_name);
  
  const domain = await DomainOperations.getByName(normalizedDomain);
  // ...
});
```

### 返回域名给前端

```typescript
router.get('/domains', async (req, res) => {
  const domains = await DomainOperations.getAll();
  
  // ✅ 根据认证方式决定返回格式
  const tokenPayload = (req as any).tokenPayload;
  
  const displayDomains = domains.map(d => ({
    ...d,
    name: tokenPayload 
      ? d.name  // Token 认证：保持 Punycode
      : getDisplayDomain(d.name, true)  // Session 认证：转 Unicode
  }));
  
  res.json(displayDomains);
});
```

### 域名比较

```typescript
// ✅ 自动处理 Unicode/Punycode 等价性
if (areDomainsEqual(inputDomain, storedDomain)) {
  // 域名已存在
}
```

## 架构说明

```
路由层 (routes/)
    ↓ 导入
DNS 工具模块 (utils/dns.ts) ← 统一导出
    ↓ 重新导出
域名工具实现 (utils/domain.ts) ← 实际实现
    ↓ 依赖
punycode.js 库
```

## 注意事项

1. **数据库存储**：始终使用 `normalizeDomain()` 转换为 Punycode 后存储
2. **API 查询**：查询前先用 `normalizeDomain()` 标准化
3. **前端显示**：使用 `getDisplayDomain()` 根据认证方式决定格式
4. **域名比较**：使用 `areDomainsEqual()` 而不是直接字符串比较

## 相关文件

- 实现文件：[`server/src/utils/domain.ts`](./domain.ts)
- 统一导出：[`server/src/utils/dns.ts`](./dns.ts)
- 类型定义：[`server/src/types/punycode.d.ts`](../types/punycode.d.ts)
