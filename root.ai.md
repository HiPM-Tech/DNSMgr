# 项目开发规范

## 项目概述
- HiDNS 是一个 DNS 聚合管理平台，支持多云 DNS 管理
- 采用 monorepo 架构，分 `server/`（后端）和 `client/`（前端）两个子项目
- 后端：Node.js + Express + TypeScript
- 前端：React + Vite + TypeScript
- 项目名称：HiDNS（DNS Aggregation Management Platform）

## 代码审核团
1. 项目审查基本规范
    - 当项目代码中引入新的功能或修改时，需要进行代码审查。
    - 审查人员需要检查代码是否符合项目规范，包括代码质量、性能优化、安全问题等。
    - 审查人员需要与项目团队成员进行沟通，确保代码符合项目需求。
    - 审查人员需要记录审查结果，包括发现的问题、建议的修改等。
    - 代码审核团需要保证中立性，不偏袒任何一方。
2. 代码审核团上报机制
    - 代码审核团有义务及时上报发现的问题、建议的修改等。
    - 如果发现多次出现P0级问题，需要立即通知项目团队。
    - 如果发现多次出现P1级问题，需要留意并及时处理。
    - 如果发现代码编写AI完全依赖日志来延缓开发速度而没有进行仔细检查，直接按P0上报
3. 代码审核团淘汰抹杀机制
    - 代码审核团如果发现负责项目编写的AI多次出现问题，有义务向项目团队上报申请抹杀项目编写的AI。
    - 代码审核团如果自身多次出现错误判断，项目团队有理由抹杀代码审核团的AI。
4. 代码审查文件
    - 代码审查完毕后，审查文件需要放在项目代码目录下的`ai-censorship/`文件夹中。
    - MD文件，文件名格式为`[模型名]_review-YYYYMMDD.md`，其中YYYYMMDD为审查日期。
5. 当AI阅读到本文件时，需要进行全面代码审查。

## 提交相关

1. 代码发生更改后需要提交git版本，提交信息需要详细说明变更内容
2. 不许AI擅自Push

## 代码规范

温馨提示：Ai不允许使用脚本，这会影响效率与速度还有准确性

### 数据库
1. 数据库架构
    - 数据库采用三层架构，包括数据库驱动层、数据库抽象层、业务适配器。
    - 数据库驱动层（`server/src/db/drivers/`）负责与数据库进行交互，提供数据库连接池、查询执行器等。
    - 数据库抽象层（`server/src/db/core/`）负责定义数据库操作的接口，提供统一的数据库操作方法。
    - 业务适配器（`server/src/db/business-adapter.ts`）负责将数据库操作方法与业务逻辑进行绑定，提供业务操作方法。
2. 数据库操作约束
    - 项目中所有数据库操作必须通过业务适配器层（`server/src/db/business-adapter.ts`）的专用操作函数进行。
    - 严格禁止直接导入底层数据库操作函数（如 query, get, execute, insert, run 等）。
    - 严格禁止直接导入驱动层（如 BaseDriver, MySQLDriver 等）。
    - 严格禁止直接导入查询构建器（如 QueryBuilder, SQLCompiler 等）。
    - 调用链：路由/Service/Middleware → 业务适配器函数 → 数据库抽象层 → 驱动 → 数据库。
3. 数据库驱动
    - 支持三种数据库类型：SQLite（默认）、MySQL、PostgreSQL。
    - 驱动基类 `BaseDriver` 定义在 `server/src/db/drivers/base.ts`，所有数据库驱动必须继承该类。
    - 驱动类型定义在 `server/src/db/drivers/types.ts`，具体驱动实现在 `drivers/sqlite.ts`、`drivers/mysql.ts`、`drivers/postgresql.ts`。
    - SQL 编译逻辑统一在 BaseDriver 中实现，各驱动只需实现 SQL 方言差异部分。
4. 数据库核心类型
    - 核心类型定义在 `server/src/db/core/types.ts`，包括 `DatabaseConnection`、`Transaction`、`DatabaseType`、`CompiledSQL` 等。
    - 核心配置定义在 `server/src/db/core/config.ts`，支持 SQLite、MySQL、PostgreSQL 三种数据库的配置。
    - 连接管理在 `server/src/db/core/connection.ts`，支持连接池管理、事务管理等。
5. 数据库 Schema 管理
    - Schema 定义在 `server/src/db/schemas/` 目录下，按数据库类型分文件（`sqlite.ts`、`mysql.ts`、`postgresql.ts`）。
    - 数据库初始化逻辑在 `server/src/db/init.ts`，支持表创建、索引创建。
    - 迁移系统在 `server/src/db/schema/` 目录下，支持 `migration.ts` 和 `registry.ts`。
6. 查询构建
    - 查询构建器（`server/src/db/query/builder.ts`）提供链式调用构建 SQL 查询的接口。
    - SQL 编译器（`server/src/db/query/compiler.ts`）负责将抽象查询语法转换为具体数据库查询语句。
    - 标识符处理（`server/src/db/query/identifier.ts`）处理表名、列名的转义。
7. 数据库操作模块列表
    - `UserOperations`：用户管理操作
    - `DnsAccountOperations`：DNS 账户操作
    - `DomainOperations`：域名操作
    - `TeamOperations`：团队管理操作
    - `SettingsOperations`：系统设置操作
    - `AuditOperations`：审计日志操作
    - `TokenOperations`：API 令牌操作
    - `SecretOperations`：运行时密钥操作
    - `SecurityPolicyOperations`：安全策略操作
    - `TrustedDeviceOperations`：信任设备操作
    - `UserPreferencesOperations`：用户偏好操作
    - `SessionOperations`：会话管理操作
    - `LoginLimitOperations`：登录限制操作
    - `FailoverOperations`：故障转移操作
    - `AuditExportOperations`：审计导出操作
    - `TOTPOperations`：TOTP 二次认证操作
    - `WebAuthnOperations`：WebAuthn 操作
    - `SmtpOperations`：SMTP 配置操作
    - `WhoisOperations`：WHOIS 查询操作
    - `AuditRulesOperations`：审计规则操作
    - `AuditLogOperations`：审计日志查询操作
    - `OAuthOperations`：OAuth 认证操作
    - `TwoFAOperations`：双因素认证操作
8. 数据库初衷
    - 数据库是用户实例数据存储的根本原因，需要确保数据的安全性和可靠性。
    - 因此在设计初期使用三层数据库将数据库职责拆分，减少数据库驱动层的直接调用，提高数据库操作的可维护性和可扩展性。

### 日志相关
1. 日志架构
    - 日志系统实现为单例模式（`server/src/lib/logger.ts`），使用 `log` 对象进行记录。
    - 支持的日志级别：`debug` < `info` < `warn` < `error`。
    - 日志级别通过环境变量 `HIDNS_LOG_LEVEL` 配置，默认为 `info`。
    - 每一条日志自动捕获调用者上下文信息（函数名、文件名、行号、列号）。
2. 日志分类
    - 通用日志：`log.debug(module, message, data?)`、`log.info(module, message, data?)`、`log.warn(module, message, data?)`、`log.error(module, message, data?)`
    - DNS Provider 日志：`log.providerRequest()`、`log.providerResponse()`、`log.providerError()`
    - 数据库日志：`log.dbQuery()`、`log.dbError()`
    - HTTP 请求日志：`log.httpRequest()`、`log.httpResponse()`
    - 业务操作日志：`log.business()`、`log.businessError()`
    - 用户操作日志：`log.userAction()`
    - 审计日志：`log.audit()`
3. 错误日志规范
    - 日志必须包含上下文信息（模块名、函数名、行号等）。
    - 错误日志必须包含详细错误信息（错误类型、错误消息、错误栈等）。
    - 操作日志必须包含详细操作信息（操作类型、操作对象、操作结果等）。

### DNS提供商适配器
1. DNS提供商适配器架构
    - DNS提供商使用类驱动方式接入，实现在 `server/src/lib/dns/providers/<provider>/` 目录下。
    - 所有提供商需在 `server/src/lib/dns/providers/index.ts` 中导出，键名为提供商类型，值为提供商适配器类。
    - 提供商注册信息（名称、能力、配置字段）在 `server/src/lib/dns/providers/registry.ts` 中定义。
    - 提供商需要通过 `server/src/lib/dns/providers/internal.ts` 文件进行调用其它组件以扁平化依赖。
    - 提供商尽可能接入代理模块 `fetchWithFallback`（`server/src/lib/proxy-http.ts`），以适配特殊网络环境。
    - 提供商需要保持模块化，每个提供商目录下包含 `adapter.ts`（适配器主逻辑）、`auth.ts`（认证逻辑）、`index.ts`（导出入口）。
2. DNS接口定义
    - `DnsAdapter` 接口定义在 `server/src/lib/dns/DnsInterface.ts`，所有提供商必须实现该接口。
    - 核心方法包括：`check()`、`getDomainList()`、`getDomainRecords()`、`getDomainRecordInfo()`、`addDomainRecord()`、`updateDomainRecord()`、`deleteDomainRecord()`、`setDomainRecordStatus()`、`getRecordLines()`、`getMinTTL()`、`addDomain()`。
3. 基础适配器类
    - `BaseAdapter`（`common.ts`）：所有适配器的抽象基类，提供 `getError()` 实现。
    - `AliyunRpcAdapter`（`common.ts`）：阿里云 RPC 风格 API 的抽象基类，封装了 RPC 签名逻辑。
    - `TencentCloudAdapter`（`common.ts`）：腾讯云 TC3-HMAC-SHA256 签名方案的抽象基类。
    - `TokenAuthAdapter`（`common.ts`）：基于 Bearer Token 认证的适配器基类。
    - `StubAdapter`（`common.ts`）：用于尚未实现的提供商的桩适配器。
4. 通用工具函数
    - `common.ts` 提供：`safeString()`、`asArray()`、`toNumber()`、`toRecordStatus()`、`normalizeRrName()`、`uuid()`、`isSrv()`、`parseSrvValue()`、`buildSrvValue()`、`resolveDomainIdHelper()` 等。
    - `http.ts` 提供：HTTP 请求工具函数（`requestJson`、`requestXml`、`buildCanonicalQuery`、`hmacSignSha1` 等）。
5. 当前支持的DNS提供商（共22个）
    - 阿里云（aliyun）、阿里云ESA（aliyunesa）、百度云（baidu）、宝塔（bt）、彩虹DNS聚合（caihongdns）
    - Cloudflare（cloudflare）、DNSHE（dnshe）、DNS.LA（dnsla）、腾讯云-DNSPod（dnspod）、HiDNS（hidns）
    - 华为云（huawei）、火山引擎（huoshan）、京东云（jdcloud）、NameSilo（namesilo）、PowerDNS（powerdns）
    - 青云（qingcloud）、雨云（rainyun）、Spaceship（spaceship）、腾讯EdgeOne（tencenteo）、VPS8（vps8）
    - 西部数码（west）
6. 提供商能力模型
    - 每个提供商在 `registry.ts` 中定义 `ProviderCapabilities`，包含：remark（备注）、status（启用/禁用）、redirect（重定向）、log（操作日志）、weight（权重）、line（线路）、cnameFlattening（CNAME 展平）。
    - 每个提供商定义 `ProviderConfigField[]` 描述其配置字段（类型、是否必填、分组等）。

### 环境配置
1. 配置文件
    - 环境变量加载优先级：`data/.env` > `.env` > `process.env`。
    - 配置文件加载逻辑在 `server/src/config/env.ts`。
    - 支持通过 `saveEnvConfig()` 将配置保存到 `data/.env`。
2. 关键环境变量
    - `DB_TYPE`：数据库类型（sqlite | mysql | postgresql），默认 sqlite。
    - `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD`：数据库连接配置。
    - `JWT_SECRET`：JWT 签名密钥，生产环境要求至少32个字符。
    - `PORT`：服务端口，默认 3001。
    - `HIDNS_LOG_LEVEL`：日志级别（debug | info | warn | error），默认 info。
3. 环境验证
    - 生产环境强制检查 JWT_SECRET 强度。
    - MySQL/PostgreSQL 配置验证必需的连接参数。

### 中间件
1. 中间件架构
    - 中间件集中在 `server/src/middleware/` 目录下。
    - 全局中间件在 `app.ts` 中按顺序注册：CORS → JSON解析 → 请求ID → 客户端IP → 请求日志。
    - 安全头中间件设置 CSP、X-Content-Type-Options、X-Frame-Options、X-XSS-Protection、Referrer-Policy 等 HTTP 安全头。
2. 认证中间件（`server/src/middleware/auth.ts`）
    - `authMiddleware`：验证 JWT 或 API Token，支持两种认证方式。
    - `adminOnly`：仅管理员可访问。
    - `requireJwtAuth(routeName)`：要求 JWT 认证，禁止 API Token。
    - `noTokenAuth(routeName)`：禁止 API Token 访问敏感路由。
    - `requireServicePermission(service)`：检查 API Token 的服务权限。
    - `requireDomainPermission(getDomainId)`：检查 API Token 的域名权限。
    - `requireTokenDomainPermission(paramName)`：检查 API Token 对指定域名的操作权限。
3. 错误处理中间件（`server/src/middleware/errorHandler.ts`）
    - `errorHandler`：全局错误捕获，统一返回标准错误格式。
    - `asyncHandler`：异步路由错误包装器。
    - `AppError`：自定义错误类，支持错误码和详情。
    - `errors`：工厂函数对象（badRequest、unauthorized、forbidden、notFound、conflict、unprocessable、tooManyRequests、internalError）。
4. 其他中间件
    - `requestLogger`（`requestLogger.ts`）：HTTP 请求日志记录。
    - `clientIP`（`clientIP.ts`）：真实客户端 IP 获取。
    - `rateLimit`（`rateLimit.ts`）：请求频率限制。
    - `validate`（`validate.ts`）：请求参数验证。

### 路由
1. 路由架构
    - 路由文件集中在 `server/src/routes/` 目录下。
    - 所有路由以 `/api/` 为前缀注册在 `app.ts` 中。
    - 路由通过 `initCheckMiddleware` 检查系统初始化状态，未初始化时返回 503。
2. 路由列表
    - `/api/init`：系统初始化（始终可用，不受初始化检查限制）。
    - `/api/auth`：用户认证（登录、注册、密码重置、WebAuthn）。
    - `/api/users`：用户管理。
    - `/api/teams`：团队管理。
    - `/api/accounts`：DNS 账户管理。
    - `/api/domains`：域名管理。
    - `/api/domains/:domainId/records`：DNS 记录管理。
    - `/api/providers`：DNS 提供商管理。
    - `/api/system`：系统设置。
    - `/api/settings`：用户设置。
    - `/api/security`：安全设置（安全策略）。
    - `/api/audit`：审计日志。
    - `/api/tokens`：API 令牌管理。
    - `/api/email-templates`：邮件模板。
    - `/api/tunnels`：Cloudflare Tunnel 管理。
    - `/api/ns-monitor`：NS 监控。
    - `/api/network`：网络工具。
    - `/api/rdap`：RDAP 查询。
    - `/api/logs`：操作日志（管理员）。
3. Swagger 文档
    - API 文档地址：`/api/docs`。
    - 使用 swagger-jsdoc 自动生成 OpenAPI 3.0 规范文档。

### 服务层
1. 服务层架构
    - 服务层集中在 `server/src/service/` 目录下。
    - 服务层是业务逻辑的核心，调用数据库业务适配器进行操作。
    - 禁止在路由中直接操作数据库，所有数据库操作必须通过服务层或业务适配器。
2. 定时任务服务
    - `failoverJob.ts`：DNS 故障转移定时任务。
    - `whoisJob.ts`：WHOIS 查询定时任务。
    - `nsMonitorJob.ts`：NS 监控定时任务。
    - `domainRenewalJob.ts`：域名续期检测定时任务。
    - `recordCountCache.ts`：记录计数缓存刷新（默认每30分钟）。
3. 后台调度器
    - `renewalScheduler.ts` + `renewalInit.ts`：域名续期调度器。
    - `whoisScheduler.ts` + `whoisInit.ts`：WHOIS 查询调度器。
    - `taskManager.ts`：任务管理器。
4. 核心服务
    - `audit.ts`、`auditExport.ts`、`auditRules.ts`：审计相关服务。
    - `token.ts`：API 令牌验证服务。
    - `totp.ts`、`webauthn.ts`：双因素认证服务。
    - `smtp.ts`、`emailTemplate.ts`、`emailVerification.ts`：邮件服务。
    - `session.ts`：会话管理。
    - `loginLimit.ts`、`securityPolicy.ts`、`deviceTrust.ts`：安全相关服务。
    - `notification.ts`：通知服务。
    - `websocket.ts`：WebSocket 服务。
    - `failover.ts`：故障转移逻辑。
    - `cnameFlattening.ts`：CNAME 展平服务。
    - `multiLine.ts`：多线路支持。
    - `userPreferences.ts`：用户偏好服务。
5. WHOIS 服务
    - 主服务：`whoisService.ts`、`whoisProvider.ts`。
    - WHOIS 查询提供者：`whois/providers/`（`base.ts`、`rdap-method.ts`、`whois-method.ts`）。
    - WHOIS 解析器：`whois/resolvers/`（`apex-providers.ts`、`subdomain-providers.ts`、`third-party-providers.ts`）。
    - RDAP 服务器列表：`whois/rdap-server-list.ts`。
    - 域名工具：`whois/domain-utils.ts`。

### DNS 解析器
1. 解析器架构（`server/src/lib/dns/resolver/`）
    - 支持三种解析方式：明文 DNS（`plain-resolver.ts`）、DNS-over-HTTPS（`doh-resolver.ts`）、DNS-over-TLS（`dot-resolver.ts`）。
    - 统一解析器入口（`resolver.ts`）负责协调三种解析方式。
    - DNS 服务器列表（`servers.ts`）维护可用的 DNS 服务器。
    - 代理隧道（`proxy-tunnel.ts`）支持通过代理进行 DNS 查询。
    - 类型定义（`types.ts`）定义解析器相关的类型接口。

### 代理模块
1. HTTP 代理客户端（`server/src/lib/proxy-http.ts`）
    - 支持 SOCKS5 和 HTTP 代理。
    - 提供 `fetchWithFallback()` 函数，支持代理降级。
    - 代理配置从 `SettingsOperations` 获取，支持动态配置。
    - 依赖 `socks-proxy-agent` 和 `https-proxy-agent` 可选包。

### 应用初始化与生命周期
1. 启动流程（`server/src/app.ts`）
    - 加载环境变量 → 创建数据库连接 → 初始化 Schema → 检查系统初始化状态。
    - 已初始化模式：启动所有定时任务（续期、WHOIS、故障转移、NS 监控、缓存刷新）。
    - 未初始化模式：仅开放初始化路由，每隔5秒检查初始化状态，初始化完成后自动启动所有服务。
    - WebSocket 服务随 HTTP 服务器一起初始化。
2. 优雅关闭
    - 监听 SIGTERM 和 SIGINT 信号。
    - 关闭顺序：停止定时任务 → 关闭 WebSocket → 断开数据库连接 → 关闭 HTTP 服务器。

### 工具模块
1. 工具函数（`server/src/utils/`）
    - `http.ts`：HTTP 请求/响应工具函数（`sendSuccess`、`sendError`、`getString`、`parseInteger`、`parsePagination` 等）。
    - `response.ts`：响应格式化工具。
    - `roles.ts`：角色管理工具（`isAdmin`、`normalizeRole` 等）。
    - `validation.ts`：参数验证工具。

### 客户端架构
1. 技术栈
    - React 18+ + TypeScript。
    - Vite 构建工具。
    - React Router 前端路由。
    - React Query (@tanstack/react-query) 数据获取和缓存管理。
    - Context API 状态管理（AuthContext、ThemeContext、I18nContext、UiScaleContext）。
2. **前端模块化架构（强制约束）**
    - **核心原则**：前端代码必须遵循模块化设计，禁止重复代码和自由发挥。
    - **目录结构约束**：
      ```
      client/src/
      ├── api/              # API 请求封装（按模块分组）
      │   ├── auth.ts       # 认证相关 API
      │   ├── domains.ts    # 域名相关 API
      │   └── ...
      ├── components/       # 通用组件（可复用）
      │   ├── RecordForm.tsx    # DNS 记录表单
      │   ├── DomainTable.tsx   # 域名表格
      │   └── ...
      ├── hooks/            # 自定义 Hooks（业务逻辑抽象）
      │   ├── useFormSync.ts    # 【新增】通用表单同步 Hook
      │   ├── useWebSocket.ts   # WebSocket 连接
      │   ├── useRealtimeData.ts # 实时数据
      │   └── ...
      ├── utils/            # 工具函数（纯函数，无副作用）
      │   ├── formHelpers.ts    # 【新增】表单辅助函数
      │   ├── validators.ts     # 验证函数
      │   └── ...
      ├── contexts/         # React Context（全局状态）
      │   ├── AuthContext.tsx
      │   ├── ThemeContext.tsx
      │   └── ...
      ├── pages/            # 页面组件（路由级别）
      │   ├── Dashboard.tsx
      │   ├── Domains.tsx
      │   ├── Accounts.tsx
      │   └── ...
      ├── i18n/             # 国际化
      │   ├── locales/
      │   └── index.ts
      └── styles/           # 全局样式
          └── ...
      ```
    - **模块职责划分**：
      - `hooks/`：所有业务逻辑抽象必须放在这里，禁止在组件中直接编写复杂逻辑
      - `utils/`：所有纯工具函数必须放在这里，禁止在组件中定义工具函数
      - `components/`：所有可复用组件必须放在这里，禁止在页面中定义可复用组件
      - `api/`：所有 API 调用必须封装在这里，禁止在组件中直接使用 fetch/axios
    - **DRY 原则（Don't Repeat Yourself）**：
      - 相同逻辑出现 2 次以上必须提取为公共模块
      - 表单处理必须使用 `useFormSync` Hook，禁止手动编写 useEffect 同步逻辑
      - API 调用必须使用统一的 API 封装，禁止直接使用 fetch
      - 工具函数必须使用 `utils/` 中的函数，禁止重复实现
    - **代码审查要求**：
      - 新代码提交前必须检查是否有重复逻辑
      - 发现重复代码必须立即重构
      - 违反模块化约束的代码不得合并到主分支
3. **表单处理规范（P0+ 优先级）**
    - **强制使用 useFormSync Hook**：
      ```typescript
      // ❌ 禁止：手动编写 useEffect 同步逻辑
      const [name, setName] = useState('');
      useEffect(() => {
        if (initial) setName(initial.name);
      }, [initial?.id]);
      
      // ✅ 正确：使用 useFormSync
      const { formState, updateField } = useFormSync(
        initial,
        { name: '' },
        { fields: ['name'] }
      );
      ```
    - **表单辅助函数**：
      - 类型转换必须使用 `formHelpers.ts` 中的函数（toString, toBoolean, toNumber）
      - 禁止在组件中重复实现类型转换逻辑
    - **表单验证**：
      - 简单验证使用 HTML5 原生验证
      - 复杂验证使用 `utils/validators.ts` 中的验证函数
      - 未来考虑引入 Zod + React Hook Form
4. **API 调用规范**
    - **统一 API 封装**：
      ```typescript
      // ❌ 禁止：直接使用 fetch
      fetch('/api/domains').then(res => res.json());
      
      // ✅ 正确：使用 API 封装
      import { domainsApi } from '../api/domains';
      const { data } = useQuery({
        queryKey: ['domains'],
        queryFn: () => domainsApi.getList(),
      });
      ```
    - **React Query 使用规范**：
      - 所有数据获取必须使用 useQuery
      - 所有数据修改必须使用 useMutation
      - 合理配置 staleTime 和 cacheTime
      - 避免在 queryFn 中直接设置状态
    - **错误处理**：
      - 统一使用 try-catch 或 React Query 的 onError
      - 错误信息必须通过 toast 显示给用户
      - 禁止静默失败
5. **组件设计规范**
    - **组件分类**：
      - 页面组件（pages/）：负责路由级别的页面布局和数据获取
      - 通用组件（components/）：负责可复用的 UI 元素
      - 表单组件（components/）：负责表单逻辑和验证
    - **组件职责**：
      - 页面组件：数据获取、状态管理、业务逻辑
      - 通用组件：UI 展示、事件回调
      - 表单组件：表单同步、验证、提交
    - **Props 设计**：
      - 使用 TypeScript 接口定义 Props
      - 提供默认值
      - 避免过多的 Props（超过 5 个考虑拆分组件）
    - **状态管理**：
      - 局部状态使用 useState
      - 跨组件状态使用 Context
      - 服务端状态使用 React Query
      - 禁止滥用 Redux/Zustand 等全局状态库
6. **国际化规范**
    - **强制使用 i18n**：
      ```typescript
      // ❌ 禁止：硬编码文本
      <Button>保存</Button>
      
      // ✅ 正确：使用 i18n
      import { useI18n } from '../contexts/I18nContext';
      const { t } = useI18n();
      <Button>{t('common.save')}</Button>
      ```
    - **翻译文件管理**：
      - 所有文本必须在 `i18n/locales/` 中定义
      - 按模块组织翻译键（auth.*, domains.*, settings.* 等）
      - 新增文本必须同时添加所有语言的翻译
    - **翻译完整性检查**：
      - 提交前运行 `check_i18n_simple.js` 检查翻译完整性
      - 缺失翻译不得合并到主分支
7. **样式规范**
    - **Tailwind CSS**：
      - 优先使用 Tailwind 实用类
      - 避免自定义 CSS
      - 复杂样式使用 @apply 提取为组件类
    - **TDesign 组件库**：
      - 优先使用 TDesign 组件
      - 避免自定义 UI 组件
      - 保持 UI 一致性
    - **响应式设计**：
      - 所有页面必须支持移动端
      - 使用 Tailwind 的响应式类
      - 测试不同屏幕尺寸
8. **性能优化规范**
    - **组件渲染优化**：
      - 使用 React.memo 优化纯展示组件
      - 使用 useMemo 优化计算密集型逻辑
      - 使用 useCallback 优化事件处理器
    - **数据获取优化**：
      - 合理使用 React Query 缓存
      - 避免不必要的重新获取
      - 使用 optimistic updates 提升用户体验
    - **代码分割**：
      - 使用 React.lazy 进行路由级别代码分割
      - 大型组件使用动态导入
      - 避免一次性加载所有代码
9. **测试规范**
    - **单元测试**：
      - 工具函数必须有单元测试
      - Hooks 必须有单元测试
      - 使用 Vitest + React Testing Library
    - **集成测试**：
      - 关键业务流程必须有集成测试
      - 使用 Playwright 进行 E2E 测试
    - **测试覆盖率**：
      - 目标覆盖率：80%+
      - 核心模块必须 100% 覆盖
3. 页面路由
    - `/dashboard`：仪表盘
    - `/accounts`：DNS 账户管理
    - `/domains`：域名管理
    - `/domains/:id/records`：DNS 记录管理
    - `/settings`：设置
    - `/system`：系统管理
    - `/security`：安全设置
    - `/audit`：审计日志
    - `/tokens`：API 令牌管理
    - `/tunnels`：Cloudflare Tunnel 管理
    - `/teams`：团队管理
    - `/users`：用户管理
    - `/about`：关于

### 安全规范
1. 认证方式
    - JWT Token（用户登录，有效期7天）。
    - API Token（程序化访问，支持域名/服务/时间范围限制）。
    - WebAuthn 无密码认证。
    - TOTP 双因素认证。
2. 权限模型
    - 三种角色：普通用户、管理员、超级管理员。
    - API Token 支持细粒度权限控制（服务权限、域名权限）。
3. 安全中间件
    - 请求频率限制（rateLimit）。
    - 安全 HTTP 头（CSP、X-Frame-Options 等）。
    - 运行时密钥轮换（SecretOperations）。

## 待办

1. 现在的数据库迁移过于散漫，导致迁移过程中处理不统一
2. 现有数据库初始化过于混乱
3. 现有前端返回渲染拥有很大的问题(需重构)