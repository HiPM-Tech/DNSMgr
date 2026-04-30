# DNS 核心层架构

## DNS 接口定义

**文件位置**: `server/src/lib/dns/DnsInterface.ts`

**职责**: 定义 DNS 服务商适配器的标准接口

### 核心接口

```typescript
interface DnsAdapter {
  check(): Promise<boolean>
  getDomainList(page: number, pageSize: number): Promise<PageResult<DomainInfo>>
  getDomainRecords(domain: string, page: number, pageSize: number): Promise<PageResult<DnsRecord>>
  addDomainRecord(domain: string, record: DnsRecord): Promise<string | null>
  updateDomainRecord(domain: string, recordId: string, record: DnsRecord): Promise<boolean>
  deleteDomainRecord(domain: string, recordId: string): Promise<boolean>
  setDomainRecordStatus(domain: string, recordId: string, status: 'enable' | 'disable'): Promise<boolean>
  getError(): string
}
```

## DNS 适配器工厂

**文件位置**: `server/src/lib/dns/DnsHelper.ts`

**职责**: 根据服务商类型创建对应的适配器实例

```typescript
// 创建适配器实例
createAdapter(type: string, config: Record<string, string>, domain?: string, zoneId?: string): DnsAdapter

// 获取所有支持的服务商
getProviders(includeStub?: boolean): ProviderInfo[]
```

## 服务商注册表

**文件位置**: `server/src/lib/dns/providers/registry.ts`

**职责**: 集中管理所有 DNS 服务商的定义和配置

### Provider 定义

```typescript
export interface ProviderDefinition {
  type: string;
  name: string;
  capabilities: ProviderCapabilities;
  configFields: ProviderConfigField[];
  adapterFactory: (config: Record<string, string>) => DnsAdapter;
}

export interface ProviderCapabilities {
  remark: boolean;        // 支持备注
  status: boolean;        // 支持状态切换
  redirect: boolean;      // 支持重定向
  log: boolean;           // 支持日志
  weight: boolean;        // 支持权重
  line: boolean;          // 支持线路
  cnameFlattening: boolean; // 支持 CNAME 拉平
}

export interface ProviderConfigField {
  key: string;
  label: string;
  type: 'text' | 'password';
  required: boolean;
  group?: string;
}
```

## 支持的服务商列表

| 类型 | 名称 | 能力 |
|------|------|------|
| `aliyun` | 阿里云 | status, log, line |
| `dnspod` | 腾讯云-DNSPod | status, log, line |
| `huawei` | 华为云 | status, line |
| `baidu` | 百度云 | status, line |
| `huoshan` | 火山引擎 | status, line |
| `jdcloud` | 京东云 | status, line |
| `cloudflare` | Cloudflare | remark, redirect, weight, line, cnameFlattening |
| `dnsla` | DNS.LA | status, weight, line |
| `west` | 西部数码 | status, line |
| `qingcloud` | 青云 | status, line |
| `namesilo` | NameSilo | line |
| `bt` | 宝塔 | status, line |
| `spaceship` | Spaceship | line |
| `powerdns` | PowerDNS | status, line |
| `aliyunesa` | 阿里云ESA | status, line |
| `tencenteo` | 腾讯EdgeOne | status, line |
| `dnshe` | DNSHE | line |
| `rainyun` | 雨云 | line |
| `vps8` | VPS8 | status, line |
| `dnsmgr` | DnsMgr | remark, status, weight |
| `caihongdns` | 彩虹DNS聚合 | remark, status, weight, line |

## 服务商别名映射

**文件位置**: `server/src/lib/dns/providerAlias.ts`

创建/更新 DNS 账号时，API 会将 lego-style provider 名称归一化为内部 provider 类型。

| 内部类型 | 支持别名 |
|---|---|
| `aliyun` | `aliyun`, `alidns` |
| `aliyunesa` | `aliesa` |
| `baidu` | `baiducloud` |
| `huawei` | `huaweicloud` |
| `huoshan` | `huoshan`, `volcengine` |
| `west` | `westcn` |
| `cloudflare` | `cloudflare` |
| `jdcloud` | `jdcloud` |
| `namesilo` | `namesilo` |
| `rainyun` | `rainyun` |
| `powerdns` | `powerdns`, `pdns` |
| `dnspod` | `dnspod`, `tencentcloud` |
| `tencenteo` | `tencenteo`, `edgeone` |

## 添加新的 DNS 服务商

### 1. 创建适配器

在 `server/src/lib/dns/providers/myprovider.ts` 中创建新的适配器：

```typescript
import { DnsAdapter, DomainInfo, DnsRecord, PageResult } from '../DnsInterface';

export class MyProviderAdapter implements DnsAdapter {
  private config: Record<string, string>;
  private error: string = '';

  constructor(config: Record<string, string>) {
    this.config = config;
  }

  async check(): Promise<boolean> {
    // 验证配置是否正确
    return true;
  }

  async getDomainList(page: number, pageSize: number): Promise<PageResult<DomainInfo>> {
    // 获取域名列表
    return { total: 0, list: [] };
  }

  async getDomainRecords(domain: string, page: number, pageSize: number): Promise<PageResult<DnsRecord>> {
    // 获取解析记录列表
    return { total: 0, list: [] };
  }

  async addDomainRecord(domain: string, record: DnsRecord): Promise<string | null> {
    // 添加解析记录
    return null;
  }

  async updateDomainRecord(domain: string, recordId: string, record: DnsRecord): Promise<boolean> {
    // 更新解析记录
    return false;
  }

  async deleteDomainRecord(domain: string, recordId: string): Promise<boolean> {
    // 删除解析记录
    return false;
  }

  async setDomainRecordStatus(domain: string, recordId: string, status: 'enable' | 'disable'): Promise<boolean> {
    // 设置记录状态
    return false;
  }

  getError(): string {
    return this.error;
  }
}
```

### 2. 注册到注册表

在 `server/src/lib/dns/providers/registry.ts` 中添加：

```typescript
import { MyProviderAdapter } from './myprovider';

const providerDefinitions: ProviderDefinition[] = [
  // ... 其他服务商
  {
    type: 'myprovider',
    name: 'My Provider',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false, line: true, cnameFlattening: false },
    configFields: [
      { key: 'apiKey', label: 'API Key', type: 'text', required: true },
      { key: 'apiSecret', label: 'API Secret', type: 'password', required: true },
    ],
    adapterFactory: (config) => new MyProviderAdapter(config),
  },
];
```

### 3. 导出适配器

在 `server/src/lib/dns/providers/index.ts` 中添加：

```typescript
export { MyProviderAdapter } from './myprovider';
```

## Cloudflare 特殊字段

DNS 记录仍保留通用 `line` 字段以兼容历史逻辑。对于 Cloudflare，请使用请求/响应中的服务商专用字段：

- `cloudflare.proxied`: 代理开关（`true` = 代理，`false` = 仅 DNS）
- `cloudflare.proxiable`: 当前记录类型是否支持代理

### 创建/更新优先级

1. 如果提供 `cloudflare.proxied`，则优先使用
2. 否则回退到 `line`（`'1'` = 代理，`'0'` = 仅 DNS）

## WHOIS 查询调度器（v1.3.2+）

**文件位置**: `server/src/service/whoisScheduler.ts`

**职责**: 统一管理 DNS 提供商的 WHOIS 查询能力，支持注册商模式

### 核心接口

```typescript
interface WhoisScheduler {
  readonly type: string;
  queryWhois(config: any, domain: string): Promise<WhoisResult | null>;
}
```

### 查询策略

WHOIS 服务支持两种查询策略：

#### 1. 顶域查询策略（默认）

```
顶域 RDAP/WHOIS → DNS 提供商 WHOIS → 第三方查询
```

#### 2. 子域查询策略

```
DNS 提供商 WHOIS → 子域/顶域并行查询 → 第三方查询
```

### 禁用父域查询选项

对于公开 RDAP 接口（`/api/rdap`），可以禁用父域 fallback 查询：

```typescript
const result = await whoisService.query('xxx.baidu.com', {
  skipParentFallback: true  // 仅查询子域，不查询 baidu.com
});
```

**查询顺序**：
```
子域 RDAP/WHOIS → 平级查询 → 第三方查询（仅子域）→ 放弃
```

### DNSHE WHOIS 调度器实现

**文件位置**: `server/src/lib/dns/providers/dnshe/whoisScheduler.ts`

DNSHE 提供商实现了 WHOIS 调度器接口，通过 DNSHE API 查询域名信息。

## 域名续期调度器（v1.3.2+）

**文件位置**: `server/src/service/renewalScheduler.ts`

**职责**: 统一管理 DNS 提供商的域名续期能力，支持注册商模式

### 核心接口

```typescript
interface RenewalScheduler {
  readonly type: string;
  listRenewableDomains(config: any): Promise<RenewableDomain[]>;
  renewDomain(config: any, domainId: number | string): Promise<RenewalResult | null>;
}
```

### DNSHE 续期调度器实现

**文件位置**: `server/src/lib/dns/providers/dnshe/scheduler.ts`

DNSHE 提供商实现了续期调度器接口：

- **listRenewableDomains**: 调用 DNSHE API 获取可续期的子域名列表
- **renewDomain**: 调用 DNSHE API 续期指定子域名

**注意**: DNSHE API 的 `listSubdomains` 不返回 `expires_at` 字段，因此对所有子域名都会尝试续期，由 API 服务端判断是否已过期。

## DNS 提供商模块化架构

### 提供商目录结构
```
providers/
├── registry.ts          # 服务商注册表（核心）
├── index.ts             # 统一导出
├── common.ts            # 公共工具函数
├── http.ts              # HTTP 请求封装
├── internal.ts          # 内部适配器
├── stubs.ts             # Stub 适配器
├── _example/            # 示例模板
│   ├── adapter.ts       # 适配器实现示例
│   ├── scheduler.ts     # 调度器实现示例（可选）
│   └── whoisScheduler.ts # WHOIS 调度器示例（可选）
├── aliyun/              # 阿里云
│   ├── adapter.ts
│   └── ...
└── ...
```

### 注册表机制
- **providerDefinitions**: 集中定义所有服务商
- **capabilities**: 声明服务商能力（remark, status, redirect, log, weight, line, cnameFlattening）
- **configFields**: 定义配置字段（text/password/select）
- **adapterFactory**: 工厂函数创建适配器实例

### 添加新提供商步骤
1. 在 `providers/myprovider/` 创建适配器
2. 在 `registry.ts` 注册服务商定义
3. 在 `index.ts` 导出适配器
4. （可选）实现 WHOIS/续期调度器
