# 更新日志

## [1.7.1] - 2026-05-28

### 🚀 主要更新

#### 域名管理增强
- **账号禁用权限控制**：禁用 DNS 账号后，该账号下的所有域名操作被完全冻结
  - 前端列表不显示禁用账号的域名
  - API 查询自动过滤禁用账号的域名（包括 DDNS Go 等外部适配器）
  - 单个域名查询、批量删除、编辑等操作全部拒绝
  - DNS 记录管理（增删改查）全部拒绝
  - WHOIS 查询不受影响（公共功能）
- **批量删除功能**：支持批量选择和删除多个域名
  - 表格组件新增复选框支持
  - 批量删除确认对话框
  - 部分失败容错处理
  - 完整的审计日志和 WebSocket 事件广播
- **账号筛选器优化**：只显示启用的账号，并显示账号类型

#### DDNS Go 适配插件优化
- **日志国际化**：所有日志从中文改为英文，便于国际用户使用
- **分页查询支持**：
  - 域名查询支持自动分页（最多 10 页/1000 个域名）
  - 记录查询支持自动分页（最多 10 页/1000 条记录）
  - 智能终止条件检测
  - 安全限制防止过度查询
- **错误处理改进**：更详细的错误信息和上下文

#### 多语言支持完善
- **批量删除翻译**：为所有 11 种语言添加批量删除相关的完整翻译
  - zh-CN, en, de, es, fr, ja, ko, pt, ru, ar, zh-CN-Mesugaki
  - 包含成功、失败、跳过等所有状态提示

### 🐛 Bug 修复

#### 已知问题
- **SMTP 发件问题**：部分运行环境下 SMTP 无法发送邮件（待修复）
- **系统 > 安全页前端回显异常**：安全配置页面部分字段回显不正确（待修复）
- **SQLite 数据库迁移问题**：部分 SQLite 数据库可能出现迁移失败（建议使用 PostgreSQL）

### 📝 技术细节

#### 修改的文件
- `server/src/routes/domains.ts` - 单个域名查询权限检查、批量删除 API
- `server/src/db/query-builders/domain-query-builder.ts` - 账号 enabled 过滤
- `server/src/db/business-adapter.ts` - 批量删除方法
- `client/src/components/Table.tsx` - 复选框支持
- `client/src/pages/domains/DomainListTab.tsx` - 批量删除 UI 和逻辑
- `client/src/api/domains.ts` - 批量删除 API 方法
- `client/src/i18n/locales/*.json` - 11 种语言的批量删除翻译
- `tmp_ddns-go/dns/hipmdnsmgr.go` - HiPMDnsMgr 适配器优化

---

## [1.7.0] - 2026-05-28

### ⚠️ 重要提示

**1.6.0 系列版本为 Bug 版本，建议尽快升级到 1.7.0！**

本版本继承了 1.6.0 系列的全部变更，并修复了多个关键问题。

### 🚀 主要更新

#### 邮件模板系统升级
- **新增邮件模板管理功能**：支持 DMARC、SPF、DKIM 等邮件安全记录的快速配置
- **配置预览功能**：添加邮件记录前可预览完整配置，避免误操作
- **主题适配**：配置预览区域完美适配暗黑/明亮/跟随系统主题
- **智能冲突检测**：自动检测域名下所有解析记录，避免记录冲突
- **缓存优化**：邮件模板数据缓存 5 分钟，提升加载速度
- **悬停预览**：长文本字段（主机记录、记录值）支持鼠标悬停预览

#### 数据库迁移系统全面优化
- **语义化版本管理**：引入 `semantic_version` 字段，支持更精细的版本追踪
- **迁移幂等性增强**：所有迁移操作支持重复执行，不会因已存在而报错
- **列验证工具**：新增自动化列验证机制，确保迁移后表结构正确
- **多数据库一致性**：SQLite、MySQL、PostgreSQL 三数据库迁移逻辑完全对齐
- **错误处理改进**：
  - PostgreSQL：修复 `PRAGMA` 语法错误，改用 `INFORMATION_SCHEMA`
  - MySQL：修复 `domain_id` 删除导致的事务回滚问题
  - SQLite：修复 `ADD COLUMN IF NOT EXISTS` 不支持的语法错误
- **迁移日志优化**：详细的迁移过程日志，便于问题诊断

#### IDN 域名支持全面优化
- **后端标准化**：统一使用 `normalizeDomain()` 函数处理国际化域名
- **定时任务支持**：域名同步、续期检查等定时任务正确处理 IDN 域名
- **前端显示优化**：IDN 域名在前端统一转换为 Unicode 显示，更易读
- **API 返回策略**：根据认证方式区分 Punycode/Unicode 编码返回
- **查询优化**：IDN 域名查询使用后端接口，支持 keyword 模糊搜索

#### 前端展示优化
- **表格组件改进**：DNS 记录表格采用 `tableLayout="fixed"`，列宽更稳定
- **悬停预览功能**：NS 监测、邮件设置等页面的长文本字段支持悬停预览
- **主题切换完善**：所有新组件完美适配暗黑/明亮主题
- **缓存策略优化**：关键数据缓存 5 分钟，减少 API 请求次数
- **用户体验提升**：
  - 域名列表自动显示禁用域名（`include_disabled=true`）
  - DMARC 记录主机名智能拼接（`_dmarc.mail` 格式）
  - 冲突检测覆盖全部解析记录，不仅限于当前页

### 🐛 已知问题

#### SMTP 发件问题
- **问题描述**：部分运行环境下 SMTP 无法发送邮件
- **影响范围**：邮件通知、测试邮件功能
- **临时方案**：检查 SMTP 配置，确认网络连接和认证信息正确
- **计划修复**：1.7.1 版本将增强 SMTP 错误日志和兼容性

#### 系统 > 安全页前端回显异常
- **问题描述**：安全配置页面部分字段回显不正确
- **影响范围**：`/dash/system/security` 页面
- **临时方案**：手动重新保存配置即可
- **计划修复**：1.7.1 版本将重构安全配置页面

#### SQLite 数据库迁移问题
- **问题描述**：部分 SQLite 数据库可能出现迁移失败或升级异常
- **影响范围**：使用 SQLite 作为数据库的用户
- **建议方案**：
  1. **重建数据库**：备份数据后重新初始化
  2. **切换到 PostgreSQL**（强烈推荐）：PostgreSQL 是本项目推荐的数据库
- **原因说明**：SQLite 的 DDL 限制较多，迁移复杂度高于 PostgreSQL/MySQL

### 💡 使用建议

#### 数据库选择
**PostgreSQL 是本项目的推荐数据库**，原因：
- ✅ 迁移脚本更友好，支持 `ADD COLUMN IF NOT EXISTS`
- ✅ 表定义更灵活，类型转换更方便
- ✅ 并发性能更好，适合生产环境
- ✅ 事务支持更完善，迁移更安全

#### 升级路径
- **从 1.6.x 升级**：直接升级到 1.7.0，会自动执行所有迁移
- **从 <1.6.0 升级**：建议先升级到 1.6.3，再升级到 1.7.0
- **SQLite 用户**：强烈建议迁移到 PostgreSQL

### 📝 技术细节

#### 修改的文件
- `server/src/db/migration-manager.ts` - 语义化版本管理
- `server/src/db/column-validator.ts` - 列验证工具（新增）
- `server/src/db/schema.ts` - 迁移逻辑优化
- `server/src/db/business-adapter.ts` - 多数据库元数据查询
- `server/src/db/schemas/*.ts` - 表定义更新
- `client/src/pages/MailSetupModal.tsx` - 邮件设置页面
- `client/src/api/domains.ts` - 域名 API 参数优化

#### 新增文档
- `server/docs/database-migration-improvements.md` - 数据库迁移改进说明
- `server/docs/database-enabled-migration-comparison.md` - 多数据库迁移对比
- `server/docs/sqlite-enabled-migration-audit.md` - SQLite 迁移审计报告
- `server/scripts/diagnose-sqlite.js` - SQLite 诊断工具

---

## [1.6.3] - 2026-05-27

### 🐛 修复

#### 数据库迁移完整性修复
- **问题描述**：PostgreSQL `dns_accounts` 表 export-rebuild 迁移后索引丢失；PostgreSQL 旧表升级时 `COALESCE(enabled, TRUE)` 读取不存在列；SQLite `dns_accounts` 表缺失 `enabled` 列定义及相关索引
- **原因分析**：PostgreSQL export-rebuild 采用 DROP+CREATE+RENAME 模式，原表索引不会自动迁移到新表；`dns_accounts` CREATE TABLE 未定义 `enabled` 列，旧版本直接建表时该列不存在
- **修复方案**：
  - PostgreSQL：export-rebuild 迁移步骤后重建 `idx_dns_accounts_created_by`、`idx_team_id`、`idx_type`、`idx_enabled` 四个索引
  - PostgreSQL：迁移脚本中 `COALESCE(enabled, TRUE)` 改为 `TRUE as enabled`，避免读取不存在列
  - PostgreSQL：`dns_accounts` CREATE TABLE 添加 `enabled BOOLEAN NOT NULL DEFAULT TRUE`
  - SQLite：`dns_accounts` CREATE TABLE 添加 `enabled INTEGER NOT NULL DEFAULT 1`
  - SQLite：`createIndexes` 补全 `idx_dns_accounts_created_by`、`idx_team_id`、`idx_type`、`idx_enabled` 索引
- **关联检查**：以 MySQL 表结构为基准，逐表逐列逐索引对比 PostgreSQL 和 SQLite，确认三数据库完全对齐，无遗漏

#### PostgreSQL `idx_domains_enabled` 索引创建顺序修复
- **问题描述**：PostgreSQL 初始化时 `CREATE INDEX idx_domains_enabled ON domains(enabled)` 在 `ALTER TABLE ADD COLUMN enabled` 之前执行，旧表升级时列不存在导致崩溃
- **修复方案**：将 `ALTER TABLE domains ADD COLUMN IF NOT EXISTS enabled` 提前到 `CREATE INDEX` 之前执行

#### 系统 > 安全页配置预填充回显修复
- **问题描述**：`/dash/system/security` 页面审计告警模块配置值无法正确回显到表单
- **原因分析**：后端 `PUT /api/settings/audit-rules` 接口未返回 `data` 字段；前端 `setAuditRules` 直接覆盖状态可能丢失未提交的本地修改
- **修复方案**：
  - 后端：PUT 接口补充返回 `data` 字段，与 GET 接口格式对齐
  - 前端：改用函数式合并更新 `setAuditRules((prev) => ({ ...prev, ...res.data.data }))`

### 🔧 改进与优化
- 更新版本号至 1.6.3
- 全数据库迁移完整性验证：34 张表、全部索引和迁移脚本已对齐

## [1.6.2] - 2026-05-26

### 🐛 修复

#### PostgreSQL 初始化崩溃 - `idx_domains_enabled` 索引创建失败
- **问题描述**：PostgreSQL 数据库中，`domains` 表升级迁移时 `enabled` 列尚未存在，但 `CREATE INDEX idx_domains_enabled ON domains(enabled)` 提前执行，导致 `column "enabled" does not exist` 错误，服务无法正常启动
- **原因分析**：`createTables` 数组中的 `ALTER TABLE ADD COLUMN enabled` 放在 `migrate` 阶段，晚于 `CREATE INDEX` 执行
- **修复方案**：将 `ALTER TABLE domains ADD COLUMN IF NOT EXISTS enabled` 提前到 `CREATE INDEX` 之前执行，确保列存在后再建索引
- **关联检查**：扫描全部 9 个迁移 ALTER TABLE + SQLite schema，确认仅此一处问题

## [1.6.1] - 2026-05-26

### 🐛 已知问题

#### 系统设置 > 安全页配置回显失败
- **影响范围**：`/dash/system/security` 页面的登录限制、审计告警、邮件服务三个模块
- **问题描述**：页面加载时，已保存的配置值未能正确预填充到表单控件中，显示为默认值而非实际配置
- **触发条件**：系统设置中存在已保存的安全相关配置时，进入该页面会触发
- **修复计划**：下个版本修复前端数据回显逻辑和后端接口响应格式对齐

### 🔧 改进与优化
- 更新版本号至 1.6.1

## [1.6.0] - 2026-05-26

### ✨ 新增功能

#### 首页展示页重构（Landing Page）
- **基于 AI_Animation 模板全面重构**
  - 全屏滚动 + 点击切换的交互效果（4 个 Section：Hero / Pipeline / Features / Footer）
  - Canvas 粒子背景 + 呼吸光晕动画 + 粒子间连线
  - 渐变模糊光晕 Blob 装饰（3 层浮动径向渐变）
  - 动画网格背景 + 噪点纹理位移
  - 导航圆点指示器（环形 + 内圆 + 发光）
  - 滚动提示鼠标动画
  - 键盘导航（↑↓←→ / Home / End）+ 触摸滑动支持
  - 响应式适配（窄屏 / 短屏 / 移动端）

- **核心组件工作流水线图**
  - 新增 Pipeline Section 展示 HiDNS 全链路架构
  - 5 层流水线：接入层 → 安全层 → 核心引擎 → 适配层 → 运维保障
  - 每层 3 个子项卡片，带图标 + 名称 + 描述
  - 动画箭头连接器 + 逐层入场动画
  - 悬浮高亮 + 微动效反馈

#### DNS 提供商日志系统
- **集中式适配器日志包装器**
  - 实现 `createLoggingAdapter`，使用 Proxy 统一拦截所有 DnsAdapter 方法调用
  - 自动记录 providerRequest / providerResponse / providerError 日志
  - 集中管理日志格式和行为，减少适配器重复代码

### 🔧 改进与优化

#### 安全与认证
- **Cookie 协议自适应**
  - Cookie `secure` 标志自动适配 HTTP/HTTPS 协议
  - 生产环境 HTTP 下不设置 secure，HTTPS 下自动启用
  - 保证 HTTP 和 HTTPS 可共同使用 Cookie

- **反向代理信任增强**
  - 生产环境 `trust proxy` 默认信任内网（10.x / 172.16-31.x / 192.168.x）
  - `getClientIP()` 自动信任内网代理 IP
  - 添加 `trustProxyIps` 白名单配置支持

- **CORS 智能配置**
  - 默认允许所有来源（`Access-Control-Allow-Origin: *`）
  - 前端自动携带 `withCredentials`，后端按来源自适应
  - 移除手动 CORS 配置需求，简化部署

- **前端路由鉴权完善**
  - 401 拦截跳转排除公开展示页 `/`
  - 有有效 Cookie 时登录页自动跳转到 `/dash`
  - 路由守卫（ProtectedRoute）覆盖所有仪表盘子路由

- **环境配置样板**
  - 完善 `.env.example` 配置样板，覆盖所有可选环境变量
  - 添加 `TRUST_PROXY_IPS`、`COOKIE_DOMAIN`、`CORS_ORIGINS` 等新配置项
  - 补充配置注释说明

#### 表单系统重构（RecordForm）
- **彻底修复编辑记录数据不回显问题**
  - 移除 TDesign FormItem 组件（其会克隆子组件并覆盖 `value`/`onChange`）
  - 改用独立 `useState` 管理每个字段 + 自定义 div 布局
  - `useEffect` 完整依赖数组确保数据同步
  - `formKey`（基于 `initial?.id`）作为依赖，编辑不同记录时状态正确重置
  - `lineOptions` 的 `value` 改为 `String(line.id)` 确保类型匹配

- **预填充默认值**
  - 添加域名解析时预填充默认值（类型=A, TTL=600, 线路=默认）
  - 编辑记录时主机记录、类型、记录值、TTL、线路、备注完整回显
  - 修复安全设置（登录限制 & 审计告警）默认值预填充
  - 修复 API 令牌编辑时域名勾选在前端显示

#### Gcore DNS 提供商优化
- **API 认证修复**
  - 修正认证头格式：`apikey` → `APIKey`（Gcore API 区分大小写）
  - 使用 `requestJson` 替代原生 `fetch`，支持代理和超时

- **响应格式兼容**
  - 支持 `zones` / `rrsets` / `total_amount` 字段解析
  - 适配器 `check()` 正确调用 `/zones?limit=1`

- **线路列表实现**
  - `getRecordLines()` 调用 Locations API 获取真实地理线路
  - 支持洲（continent）/ 国家（country）/ 地区（region）三级线路

- **日志层级优化**
  - 移除冗余的 providerResponse 日志（由 `createLoggingAdapter` 统一处理）
  - 保持与其他适配器一致的日志行为

#### NS 监测修复
- **路由顺序修复**
  - `/available-domains` 静态路由移到 `/:id` 动态路由之前，解决 404 错误
  - 完善 `GET /:id` 处理函数实现并正确闭合

- **字段统一**
  - 使用 `domain_name` 替代 `domain_id` 作为标识符
  - 修复前端监测配置域名列表展示问题
  - 自动获取结果直接填充到编辑栏

- **冗余路由清理**
  - 移除 `/api/ns-monitor/:id/check` 路由
  - 提取 `performNsCheck` 共享函数

#### 前端页面优化
- 系统 > 安全 Tab：登录限制 & 审计告警默认值预填充，移除未使用的 `loginLimitQuery` 变量
- API 令牌编辑：域名列表正确显示已勾选状态
- 域名解析列表：点击域名跳转到解析列表而非 `/`
- 添加域名解析：默认值预填充（类型=A, TTL=600, 线路=默认）

### 🐛 Bug 修复

- **TDesign Alert 弃用警告**
  - `close` → `closeBtn`，消除控制台弃用警告

- **crypto.subtle 不可用错误**
  - `rsaEncrypt.ts` 添加 `window.crypto?.subtle` 存在性检查
  - HTTP 环境下抛出清晰错误而非静默失败

- **TypeScript 编译错误**
  - 修复 `weight` 变量隐式 `any` 类型和声明前使用问题
  - 修复未使用的 `loginLimitQuery` 变量
  - 修复 Docker 构建中的 TS 错误（`tsc -b` 阶段）

- **Docker CI 超时**
  - `docker-build.yml` 中 `build-amd64` 和 `build-arm64` 添加 `timeout-minutes: 15`

### 📦 技术细节

#### 修改文件统计
- **后端核心**：DnsHelper.ts（日志包装器）、Gcore 适配器、ns-monitor 路由
- **前端页面**：Landing.tsx / Landing.css（全屏滚动 + 流水线图）、RecordForm.tsx、SecurityTab.tsx
- **安全认证**：Cookie 中间件、CORS 配置、trust proxy、路由守卫
- **配置文档**：.env.example、CHANGELOG.md、root.ai.md
- **CI/CD**：docker-build.yml（超时限制）

#### 版本升级说明
- 版本号：1.5.1 → **1.6.0**
- 201 次提交（2 周开发周期）
- 完全向后兼容

### ⚠️ 注意事项
- HTTP 与 HTTPS 混合部署时 Cookie 自动适配，无需手动配置
- 反向代理场景建议检查 `TRUST_PROXY_IPS` 环境变量配置
- 新 `.env.example` 为可选配置样板，现有部署无需修改

---

## [1.5.1] - 2026-05-17

### ✨ 新增功能

#### DNS 提供商图标系统
- **动态图标加载**
  - 实现从后端 API 动态加载提供商图标
  - 支持多种图标格式优先级：SVG > PNG > ICO > JPG
  - 添加详细的图标加载日志，便于调试
  
- **图标管理优化**
  - 将所有提供商图标移动到各自的提供商文件夹
  - 统一图标命名为 `icon.{ext}` 格式
  - 添加构建时图标复制脚本
  - 支持从 src 和 dist 目录加载图标

#### 新增 DNS 提供商
- **Gcore DNS 支持**
  - 添加 Gcore DNS 提供商适配器
  - 使用官方 favicon 作为图标
  - 集成到提供商注册表

### 🔧 改进与优化

#### 文档完善
- **README 更新**
  - 更新许可证为 GPL-3.0
  - 添加 Telegram 群组链接
  - 完善项目介绍和社区信息

#### 测试与工作流
- **测试脚本优化**
  - 更新测试脚本使用 vitest
  - 改进工作流错误处理
  - 提升 CI/CD 稳定性

### 🐛 Bug 修复

#### 图标相关问题
- **图标格式修复**
  - 修复 HiDNS 图标格式（使用正确的 favicon.ico）
  - 移除错误的 favicon.svg，只保留 favicon.ico
  - 替换 CaihongDNS 图标为官方 favicon.ico
  - 替换 VPS8 图标为官方 favicon.ico (vps8.zz.cd)
  - 更新 Gcore 图标为官方 favicon
  
- **类型错误修复**
  - 修复 Gcore 适配器在注册表中的类型错误
  - 确保所有提供商适配器类型一致

#### 路由调试
- **Provider 图标路由**
  - 为 provider 图标路由添加调试日志
  - 支持从 src 和 dist 目录加载图标
  - 改进错误处理和日志输出

### 📦 技术细节

#### 修改文件统计
- **后端**：提供商图标路由、Gcore 适配器、registry 注册表
- **前端**：动态图标加载组件
- **资源**：所有提供商图标文件重组
- **文档**：README 更新、许可证信息
- **CI/CD**：测试脚本优化、构建流程

---

## [1.5.0] - 2026-05-17

### ✨ 重大功能

#### 项目品牌升级
- **项目名称变更**
  - 项目从 DNSMgr 正式更名为 HiDNS
  - 所有文档、配置文件和代码标识统一更新为 HiDNS
  - Docker 镜像标签和发布文件名更新为 HiDNS
  - CI/CD 工作流配置同步更新

#### 前端架构重构
- **TDesign 组件库迁移**
  - 全面将 TailwindCSS 前端迁移到腾讯 TDesign 组件库
  - 使用 TDesign 组件重构所有 UI 组件
  - 提升 UI 一致性和用户体验
  
- **新增全局搜索功能**
  - 添加全局搜索功能和 UI 缩放支持
  - 优化用户操作体验
  
- **开源引用页面**
  - 添加开源引用页面展示前端技术栈信息
  - 透明化技术选型

#### WHOIS/RDAP 架构重构
- **集中化 WHOIS 架构**
  - 完全集中化 WHOIS 架构，职责分明
  - 删除分散的 whoisJob.ts，功能分散到 whois/模块
  - providers 只返回原始数据，data-parser 升格为解析中心
  - 只调用已注册 WHOIS 适配器的提供商
  
- **WHOIS 状态存储**
  - 添加 WHOIS 状态数据库存储和多语言支持
  - RDAP API 返回中添加 status 字段
  - 首次查询时正确提取并保存 WHOIS 状态
  - 改进缓存状态解析，支持 RDAP JSON 和 WHOIS 文本
  - 使用专用函数解析 WHOIS 状态，避免正则滥用
  
- **查询策略优化**
  - 公开 RDAP 路由根据查询类型智能处理
  - 公开 RDAP 路由禁用平级查询
  - 恢复完整的内部分层查询架构
  - DNS 提供商查询优先于缓存
  - DNS 提供商查询使用精确域名匹配
  - 明确公开 RDAP 路由不查询 DNS 提供商的原因
  
- **缓存优化**
  - WHOIS 缓存有效期改为 3 小时（从 1 小时调整）
  - 添加 forceRefresh 参数支持强制刷新
  - 优化数据库迁移逻辑，避免重复字段错误

#### 国际化域名 (IDN) 支持
- **全面 IDN 支持**
  - 添加中文域名 (IDN) 支持
  - 前端 CNAME 和记录表单支持国际化域名 (IDN)
  - RDAP 支持国际化域名 (IDN)
  - WHOIS/RDAP 域名续期查询支持国际化域名 (IDN)
  - NS 监测支持国际化域名 (IDN) 和 Punycode
  - 从提供商同步域名支持国际化域名 (IDN)
  - 支持下划线开头的 DNS 记录名称和值
  - 添加 xn-- 前缀边界情况测试
  - 添加国际化域名 (IDN) 测试用例

#### 安全增强
- **安全问题修复**
  - 修复明文安全问题
  - 修复多个安全漏洞
  - 进一步修复数据填充问题
  - 安全解析 account.config，兼容字符串和对象类型

### 🔧 核心优化

#### 表单系统重构
- **RecordForm 重写**
  - 使用非受控模式重写 RecordForm，使用 defaultValue
  - 修复 SRV 记录编辑时字段不回显问题
  - 使用递增 key 确保 RecordForm 每次都重新挂载
  - 简化编辑记录的 initial 传递逻辑
  - 优化 RecordForm 默认值和回显逻辑
  - 修复表单状态初始化和输入值更新问题
  
- **useFormSync Hook 优化**
  - 优化 useFormSync Hook 的初始状态设置逻辑
  - 优化表单同步 Hook 的日志记录和调试功能
  - 修复表单同步 Hook 中的调试日志和加载状态问题
  - 解决表单输入值类型不匹配问题
  
- **账户页面重构**
  - 重构账户页面表单状态管理
  - 优化账户管理页面的数据转换逻辑
  - 修复前端编辑表单数据展示问题 (P0)

#### 系统稳定性
- **启动优化**
  - 添加启动横幅显示项目信息
  - 在启动横幅中添加 GitHub 仓库地址
  - 添加彩色日志输出支持
  - 关闭时跳过数据库健康检查，避免 ERROR 日志
  
- **WebSocket 优化**
  - 优化 WebSocket 日志输出，减少噪音
  
- **登录页优化**
  - 登录页动态显示 OAuth 提供商，移除硬编码 Logto 按钮

#### 多语言支持
- **国际化完善**
  - 添加多语言支持并优化国际化功能
  - 补全所有语言的翻译
  - 修复 release.yml 乱码

### 🐛 Bug 修复

#### 关键 Bug 修复
- **表单回显问题**
  - 修复域名解析记录编辑无法正确回显的问题（持续调试中）
  - 修复安全设置页面表单默认值回显问题
  - 使用 placeholderData 确保表单默认值立即显示
  
- **主机名通配符支持**
  - ✅ 新增 DNS 记录主机名通配符 (*) 支持
  - 允许创建通配符 DNS 记录（如 `*.example.com`）
  - 通配符只能作为独立值或第一个标签使用
  - 拒绝无效的通配符位置（如 `sub.*.example.com`）
  - 前后端验证逻辑保持一致
  
- **WHOIS 相关**
  - 修复 DNSHE WHOIS 字段映射错误
  - 修复 WHOIS 状态缓存问题
  - 修复 WHOIS 查询和 TypeScript 类型错误
  - 修复 WHOIS 缓存保存原始数据格式
  
- **数据库迁移**
  - 优化 SQLite 迁移日志，避免重复列 ERROR
  - 移除 IF NOT EXISTS from SQLite migration
  - 从缓存的 raw_data 中解析 WHOIS 状态

#### 其他修复
- 移除未使用的 useEffect 导入
- 移除未使用的 domainRenewalApi 导入
- 修复 Settings.tsx 未使用导入
- 删除快捷操作卡片（未实现功能）
- 删除未实现的快捷操作翻译

### 📦 修改文件统计
- **后端核心**：WHOIS 架构重构、RDAP 路由优化、数据库迁移
- **前端组件**：RecordForm 重写、TDesign 迁移、表单系统优化
- **国际化**：IDN 支持、多语言补全
- **安全**：多处安全问题修复
- **CI/CD**：品牌更新、工作流优化

### ⚠️ 已知问题
- **域名解析记录编辑回显异常**：部分情况下编辑记录时字段无法正确回显，正在持续调试中
- **系统安全子页部分模块回显异常**：安全设置页面部分表单字段回显存在问题

---

## [1.4.3] - 2026-05-03

### 🐛 Bug修复

#### 日志系统
- **修复 `[object Object]` 输出问题**
  - `logger.ts`: 改进 `formatError` 方法，正确处理普通对象类型错误
  - 现在会显示对象内容而不是 `[object Object]`

#### SQLite 迁移
- **修复 `IF NOT EXISTS` 语法错误**
  - `schema.ts`: 添加 `checkSQLiteColumnExists()` 函数，使用 `PRAGMA table_info()` 检查列是否存在
  - `schema.ts`: 添加 `addSQLiteColumn()` 函数，带存在检查的列添加
  - `schema.ts`: 添加 `handleSQLiteMigrations()` 函数，处理所有 SQLite 特定迁移
  - `sqlite.ts`: 移除不支持的 `ALTER TABLE ADD COLUMN IF NOT EXISTS` SQL 语句

#### 数据库架构
- **修复架构违规问题**
  - `business-adapter.ts`: 添加 `DomainOperations.getAllForSuperAdmin()` 专用方法
  - `business-adapter.ts`: 删除暴露内部实现的 `queryInternal` 方法
  - `domains.ts`: 路由现在使用专用方法而不是直接调用内部函数

#### 初始化流程
- **修复 Windows 环境下初始化路由 500 错误**
  - `init.ts`: 修复 `/admin` 路由，添加 try-catch 处理数据库未连接的情况
  - `init.ts`: 增强 `/test-db` 和 `/status` 路由的日志记录
  - `business-adapter.ts`: `testSqliteConnection` 添加 Windows 路径处理（统一使用正斜杠）

#### 用户偏好设置
- **修复 `getPinnedDomains` 错误**
  - `business-adapter.ts`: 添加 try-catch，当表或字段不存在时返回空数组

#### Express 中间件
- **修复 `req.ip` 只读属性错误**
  - `clientIP.ts`: 移除设置 `req.ip` 的代码，只设置 `req.clientIP`
  - `errorHandler.ts`: 使用 `getRequestIP()` 替代 `req.ip`

#### 错误处理
- **增强错误日志记录**
  - `errorHandler.ts`: 添加错误堆栈信息、请求路径、方法、IP 地址
  - `init.ts`: 改进数据库连接测试的错误日志

### 📦 修改文件
- `server/src/lib/logger.ts`
- `server/src/middleware/errorHandler.ts`
- `server/src/middleware/clientIP.ts`
- `server/src/db/schema.ts`
- `server/src/db/schemas/sqlite.ts`
- `server/src/db/business-adapter.ts`
- `server/src/routes/init.ts`
- `server/src/routes/domains.ts`

### 🔧 兼容性
- ✅ 完全向后兼容
- ✅ 支持旧版本 SQLite (< 3.2.0)
- ✅ 修复 Windows 路径分隔符问题

---

## [1.4.2] - 2026-05-04

### ✨ 核心改进

#### DNS线路系统全面优化
- **统一线路ID规范**
  - 统一所有DNS提供商默认线路ID为 `'0'`
  - 修复 11+ 个提供商适配器的 fallback 值
  - 确保前后端线路ID完全一致
  
- **前端显示优化**
  - Records.tsx：支持 `'0'` 和 `'default'` 都显示为"默认"
  - RecordForm.tsx：统一表单初始化默认值为 `'0'`
  - 单线路和多线路提供商行为一致
  
- **阿里云适配器修复**
  - normalizeLine 函数保留 `'0'` 不转换
  - mapRecord 使用 normalizeLine 处理线路ID
  - 添加/更新/查询记录的线路ID保持一致

#### DNSHE功能增强
- **CNAME拉平支持**
  - 支持根域CNAME记录（@记录）
  - registry.ts 设置 `cnameFlattening: true`
  - 前端不再显示CNAME冲突错误
  
- **NS监测优化**
  - NSMonitorTab.tsx 前端过滤已添加的域名
  - 避免用户选择后提交遇到重复错误
  - 与续期域名的去重逻辑保持一致

### 🔧 CI/CD优化

#### Telegram通知集成
- **工作流整合**
  - 将 release-tg.yml 集成到 release.yml
  - Telegram通知作为发布流程的最后一步
  - 删除独立的 release-tg.yml 文件
  
- **配置修复**
  - 使用 `topic: 14` 参数（而非 message_thread_id）
  - 使用 Markdown 格式（而非 HTML）
  - 所有消息标签转换为 Markdown 语法

### 🌐 网络层优化

#### WebSocket真实IP获取
- **反向代理支持**
  - websocket.ts 使用 getClientIP 函数
  - 支持 X-Forwarded-For 和 X-Real-IP 头部
  - 日志正确记录真实客户端IP
  
- **TypeScript修复**
  - 添加 getClientIP 导入语句
  - 解决编译错误

### 📦 技术细节

#### 修改文件统计
- **后端适配器**（11个）
  - dnshe, vps8, west, huoshan, baidu, aliyun
  - namesilo, powerdns, spaceship, common, _example
  
- **前端组件**（3个）
  - Records.tsx（线路显示逻辑）
  - RecordForm.tsx（表单初始化和选择器）
  - NSMonitorTab.tsx（NS监测域名过滤）
  
- **CI/CD配置**
  - .github/workflows/release.yml
  
- **中间件**
  - server/src/service/websocket.ts

#### 影响的DNS提供商
阿里云、腾讯云、华为云、火山引擎、京东云、百度云、西部数码、宝塔、DNSHE、VPS8、NameSilo、PowerDNS、Spaceship等

### 🐛 Bug修复
- 修复线路fallback值不一致问题（'default' → '0'）
- 修复前端线路选择器默认值问题（'' → '0'）
- 修复WebSocket IP获取问题（remoteAddress → getClientIP）
- 修复TypeScript编译错误（缺少import）
- 修复阿里云normalizeLine转换问题（'0' → 'default'）

### 🔧 兼容性
- ✅ 完全向后兼容
- ✅ 不影响现有配置和数据
- ✅ 前端同时支持 '0' 和 'default' 显示
- ✅ 自动适配新旧数据格式

---

## [1.4.1] - 2026-05-03

### ✨ 新增功能

#### WebSocket 实时通信系统
- **全系统 WebSocket 支持**
  - 实现单连接复用架构，所有组件共享一个 WS 连接
  - 支持 38 种事件类型，覆盖所有核心功能
  - 后端 12 个路由文件，45+ 个推送点
  - 前端 15 个页面已集成实时数据支持
  
- **优雅降级机制**
  - WebSocket 3 秒超时后自动降级到 React Query 轮询
  - 不同页面有不同的轮询间隔（60秒 ~ 5分钟）
  - 确保在网络不稳定时仍能正常刷新数据
  
- **事件推送覆盖**
  - **域名管理**：`domain_created`/`updated`/`deleted`/`renewed`
  - **账号管理**：`account_created`/`updated`/`deleted`
  - **DNS 记录**：`record_created`/`updated`/`deleted`/`status_changed`
  - **用户管理**：`user_created`/`updated`/`deleted`
  - **团队管理**：`team_created`/`updated`/`deleted`/`member_added`/`removed`
  - **Token 管理**：`token_created`/`revoked`/`updated`
  - **审计日志**：`audit_log_created`（管理员实时查看）
  - **系统设置**：`smtp_updated`/`oauth_updated`/`config_updated`/`security_config_updated`
  - **安全设置**：`2fa_enabled`/`disabled`/`trusted_device_removed`
  - **NS 监测**：`ns_monitor_created`/`updated`/`deleted`
  - **故障转移**：`failover_config_created`/`updated`/`deleted`
  - **隧道管理**：`tunnel_config_updated`/`deleted`

#### 关于页面增强
- **动态贡献者列表**
  - 从 GitHub API 动态获取真实贡献者
  - 显示贡献者头像、用户名和提交次数
  - 点击可跳转到贡献者 GitHub 主页
  - 24 小时缓存策略，减少 API 调用
  
- **信息完善**
  - 添加 GitHub 仓库链接
  - 显示开源协议（GPL-3.0）
  - 添加 Telegram 社区群组链接
  - 支持多语言翻译（10 种语言）

### 🔧 问题修复

#### 路由冲突修复
- **Express 路由顺序问题**
  - 修复 `/renewable-domains` 被 `/:id` 动态路由拦截的问题
  - 将静态路由移到动态路由之前，确保优先匹配
  - 添加路由顺序警告注释，防止未来再次出现
  
- **WebSocket Token 编码**
  - 对 WebSocket token 进行 URL 编码，避免特殊字符导致连接失败
  - 确保兼容性和安全性

#### 数据库兼容性
- **PostgreSQL 类型修复**
  - 修复 `renewable_domains` boolean 类型比较错误（`TRUE` vs `1`）
  - 修复 SMTP 和 RDAP 缓存 SQL 语法错误
  - 修复 WHOIS 缓存 SQL 语法错误
  
- **WHOIS 缓存回退机制**
  - 修复 try-catch 回退机制导致的 SQL 语法错误

#### 性能优化
- **域名列表查询优化**
  - 超管 Token 域名列表查询：直接执行简单 SQL，避免权限检查
  - Token 认证域名列表查询：使用 ID 列表直接查询，避免复杂子查询
  - Token 认证跳过逐个权限检查，提升查询速度
  
- **DNSHE 域名到期时间**
  - 优先使用数据库缓存，避免重复查询 API
  - 通过 WHOIS 调度器获取，与续期功能保持一致

### 🎨 UI/UX 改进

#### 分页与排序优化
- **置顶域名排序**
  - 置顶域名在分页前排序，确保始终显示在第一页
  - 用户体验提升，重要域名始终可见
  
- **DNSPod 线路获取**
  - 添加详细日志以便调试
  - 提升问题诊断效率

#### 代理状态支持
- **Cloudflare 和 Aliyun ESA**
  - 支持代理状态管理
  - 添加 `GET /domains/:id` 接口以支持代理状态显示

###  国际化

- **多语言翻译完善**
  - 补全所有语言的关于页面翻译
  - 添加 `renew_domain` 操作类型的多语言翻译
  - 补全域名续期页 i18n 翻译
  - 优化账号显示格式

### 📚 文档

- **WebSocket 实施文档**
  - 添加 WebSocket 后端推送实施指南
  - 添加 WebSocket 实时数据集成指南
  - 添加快速开始文档
  - 更新实施进度报告（100% 完成）

- **开源协议变更**
  - 更新开源协议为 GPL-3.0
  - 更新 LICENSE 文件

### 🧹 代码清理

- **废弃代码移除**
  - 删除已废弃的旧版 NSMonitor.tsx 页面（692 行）
  - 保持代码库整洁

- **自动续期优化**
  - 自动续期添加数据库更新
  - 移除审计日志（自动任务无需审计）

### 🔒 安全增强

- **Nginx 反向代理支持**
  - 正确获取客户端真实 IP
  - 优化客户端 IP 获取逻辑，自动信任内网 IP 段

### 📊 统计数据

- **提交数量**：50+ commits
- **新增文件**：8 个
- **修改文件**：35+ 个
- **删除文件**：1 个（废弃代码）
- **代码变更**：+3,500 / -1,200 行

---

## [1.4.0] - 2026-04-30

### ✨ 新增功能

#### 域名续期系统重构
- **独立续期域名管理表** (`renewable_domains`)
  - 创建独立的 `renewable_domains` 表，实现续期域名的独立管理
  - 支持多数据库（SQLite/MySQL/PostgreSQL）自动迁移
  - 续期域名与核心域名表解耦，提升数据隔离性
  
- **范式化续期架构**
  - 将域名续期页面改为范式实现，使用通用续期调度器架构
  - 续期域名列表从数据库查询，使用 `domains` 表的 `expires_at` 字段
  - 支持批量添加续期域名到列表
  
- **两步式添加续期域名对话框**
  - 第一步：选择账号
  - 第二步：选择子域名（分页式选择器）
  - 过滤已添加的续期域名，只显示未添加的域名供选择
  - 显式设置 `enabled=1`，修复启用状态问题
  
- **续期权限验证增强**
  - 修复域名续期权限验证逻辑
  - 增强权限检查日志，便于诊断问题
  - 支持多账号权限隔离

#### WHOIS 缓存数据库化
- **WHOIS 缓存改用数据库存储**
  - 创建 `whois_cache` 表，支持 SQLite/MySQL/PostgreSQL
  - 完全接入任务管理器，后台定时刷新
  - 补全 `WhoisResult` 类型所需的 `domain` 和 `raw` 字段
  
- **自动迁移支持**
  - 添加 `whois_cache` 表自动迁移
  - 根据数据库类型选择正确的 SQL 语法
  - PostgreSQL 和 SQLite 支持 `pinned_domains` 字段迁移

#### 任务管理器优化
- **优先级插队机制**
  - 任务管理器支持优先级插队
  - 域名缓存刷新使用高优先级
  - 域名续期和故障转移任务接入任务管理器
  
- **NS 监测并发控制**
  - 引入任务管理器并优化 NS 监测并发控制
  - 防止大量并发请求导致超时

#### 用户置顶域名功能
- **后端实现**
  - 添加用户置顶域名功能（后端+API）
  - 创建 `user_preferences` 表，支持 MySQL JSON 类型
  - 为 PostgreSQL 和 SQLite 添加 `pinned_domains` 字段迁移
  
- **前端 UI**
  - 完成用户置顶域名功能前端 UI
  - 支持用户自定义域名排序

#### DNS 提供商模块化重构
- **DNS 提供商完全模块化**
  - 将 `_template.ts` 转换为 `_example` 示例文件夹
  - 统一 DNS 提供商接口规范
  - 支持 VPS8 等新提供商
  
- **VPS8 支持**
  - 添加 VPS8 提供商支持
  - 修复 record ID 类型转换问题
  - 添加详细操作日志

### 🎨 UI/UX 改进

#### 分页式域名选择器
- **API 令牌域名选择**
  - 为 API 令牌域名选择添加分页支持
  - 完善搜索和过滤功能
  - 每页显示 20 个域名
  
- **NS 监测域名选择**
  - NS 监测添加域名对话框使用分页式选择器
  - 将 `<select>` 下拉框改为单选按钮列表样式
  - 添加搜索功能和分页控件
  - 样式与 API 令牌完全一致
  
- **故障转移页面**
  - 为故障转移页面添加前端分页功能
  - 支持大数据量场景

#### 分页底栏常驻显示
- **统一分页体验**
  - 所有涉及分页的页面，分页底栏常驻显示
  - 即使只有一页数据也显示分页控件
  - 保持界面一致性，避免布局跳动
  - 影响页面：DomainListTab, FailoverTab, Tokens, Records

#### 确认对话框优化
- **文本长度限制**
  - 限制确认对话框文本最多 3 行
  - 超出显示省略号（使用 `line-clamp-3`）
  - 避免长文本破坏布局

### 🌍 国际化 (i18n)

#### 全面补全翻译
- **10 种语言完整翻译**
  - 补全所有语言的域名续期 Tab 翻译（AR, DE, ES, FR, JA, KO, PT, RU, ZH-CN, Mesugaki）
  - 补全所有语言的 NS 监测翻译键
  - 补全雌小鬼语言翻译（超有味的杂鱼风格）
  - 削弱了雌小鬼语言的干扰，保持趣味性但不过度
  
- **翻译键补充**
  - 添加 `common.deselectAll` 翻译键
  - 修复 `common.search` 在 Mesugaki 版本中未翻译的问题
  - 补全英文 i18n 翻译（domainRenewal 和 common.deselectAll）

#### 翻译质量优化
- **人工修复缩进**
  - 肉编模式：人工修复 i18n 缩进
  - 确保 JSON 格式正确
  
- **调试支持**
  - 添加 i18n 调试日志
  - 便于诊断翻译加载问题

### 🔧 技术优化

#### 域名查询优化
- **记录数缓存机制**
  - 实现域名记录数缓存机制
  - 后台定时刷新避免请求阻塞
  - 提升域名列表加载速度
  
- **pageSize 优化**
  - 修复多个页面域名列表只显示第一页的问题
  - 设置 `pageSize=1000`，支持大数据量场景
  
- **accountId 参数支持**
  - 优化域名查询逻辑，支持 `accountId` 参数
  - 添加权限回退机制

#### DNSHE 适配器优化
- **域名拼接逻辑修复**
  - 修复 DNSHE 适配器域名拼接逻辑
  - 使用 API 返回的完整域名（`full_domain`）
  - 避免域名重复问题（如 `xxx.xxx.example.com`）
  
- **恢复使用 full_domain**
  - 从 subdomain 和 rootdomain 重新构建 full_domain
  - 优先使用 API 返回的 `full_domain` 字段
  - 不手动拼接，减少错误

#### Cloudflare 修复
- **zoneId 优先级修复**
  - 修复 Cloudflare zoneId 优先级错误导致无法获取解析记录
  - 修复授权头重复设置问题
  
- **配置字段匹配**
  - 修复 `zoneId` 与 `domainId` 不匹配问题

#### 路由顺序修复
- **动态路由拦截问题**
  - 修复路由顺序问题
  - 将 `/renewable-domains` 移到 `/:id` 之前
  - 避免被动态路由拦截

#### TypeScript 类型修复
- **多处类型错误修复**
  - 修复 DomainListTab TypeScript 错误
  - 修复 business-adapter.ts 中的 TypeScript 类型错误
  - 修复 UserPreferencesOperations 导入问题
  - 修复 RenewableDomainOperations.add 返回值类型错误
  - 修复 filteredDomains TypeScript 类型错误
  - 修复 getByAccountIdAndName 重复定义和类型转换错误

#### 数据库兼容性
- **PostgreSQL boolean 类型**
  - 修复 PostgreSQL boolean 类型比较错误
  - 统一使用 TRUE/FALSE
  
- **remark 字段统一**
  - 统一三种数据库 `renewable_domains` 表 remark 字段定义（允许 NULL）
  - 修复 PostgreSQL renewable_domains 表 remark 字段不能有默认值的问题
  - 修复 MySQL renewable_domains 表 remark 字段不能有默认值的问题

### 🐛 Bug 修复

#### NS 监测修复
- **误报问题修复**
  - 修复 NS 监测误报问题
  - 修复 NS 监测页面超时导致失去登录状态
  
- **PostgreSQL 类型错误**
  - 修复 PostgreSQL NS monitor enabled field type error

#### DNSHE 修复
- **域名格式重复**
  - 修复 DNSHE 域名格式重复问题
  - 添加账号名称唯一性验证
  
- **API 文档对齐**
  - 根据 DNSHE API 文档修复域名列表获取逻辑
  - 移除 `expires_at` 字段，对所有子域名尝试续期

#### 其他修复
- **JSON 语法错误**
  - 修复 zh-CN.json JSON 语法错误
  - 删除 zh-CN.json 中重复的 title 和 subtitle 键
  
- **if 语句块缺失**
  - 修复 domains.ts 中 if 语句块缺少闭合大括号的语法错误
  
- **未使用的导入**
  - 移除未使用的 Calendar 导入以修复 Docker 构建
  - 移除未使用的 RefreshCw 导入以修复 Docker 构建
  - 移除未使用的 selectedAccountId 状态
  - 删除未使用的 handleAddDomain 函数
  - 删除未使用的 dnsheListSubdomains 导入

### 🗑️ 清理和优化

#### 废弃代码清理
- **旧 API 删除**
  - 删除废弃的 `/dnshe-subdomains` API
  - 标记 `/dnshe-subdomains` 为 deprecated
  
- **旧页面删除**
  - 删除旧的 DomainRenewal.tsx 页面和相关路由
  - 删除旧的添加域名表单代码
  - 删除临时脚本文件

#### 通用 API 替代
- **providers API**
  - 前端改用通用 providers API 获取可续期域名
  - 创建通用 providers 路由用于获取可续期域名列表
  - 不再依赖 DNSHE 特定 API

### 📝 文档更新

- **架构文档更新**
  - 更新架构文档，添加 WHOIS 和续期调度器说明
  - 添加任务管理器使用文档
  - 更新文档版本号为 v1.3.2
  
- **提供商文档**
  - 更新文档添加 VPS8 提供商支持
  
- **Tab 文案优化**
  - 修正域名页各 Tab 的标题和简介文案

### 🚀 性能优化

- **代理超时优化**
  - 代理超时缩短为 10 秒
  - 添加性能监控日志
  
- **后台刷新机制**
  - 域名记录数后台定时刷新
  - WHOIS 缓存后台定时刷新
  - 避免前端请求阻塞

---

## [1.3.2] - 2026-04-28

### ✨ 新增功能

- **WHOIS 查询注册商模式**
  - 实现 WHOIS 调度器注册商模式，支持 DNS 提供商注册 WHOIS 查询能力
  - 新增 `WhoisScheduler` 接口和注册表，统一 WHOIS 查询架构
  - DNSHE 提供商实现 WHOIS 调度器
  - 应用启动时自动初始化所有 WHOIS 调度器

- **RDAP 路由查询策略优化**
  - `/api/rdap` 公开路由采用简化查询策略
  - 顶域查询：顶域 > 第三方
  - 子域查询：仅查询子域，失败则放弃（不查询父域）
  - 适用于 NS 托管子域名场景（如 xxx.baidu.com）

- **禁用父域查询选项**
  - `whoisService.query()` 新增 `skipParentFallback` 选项
  - 支持禁用父域 fallback 查询
  - 新增 `querySubdomainOnly()` 私有方法
  - 子域查询顺序：子域 > 平级 > 第三方（仅子域）

### 🔧 架构优化

- **代理请求性能优化**
  - 代理超时从 30 秒缩短为 10 秒
  - 添加详细的性能监控日志
  - 记录代理请求和直连请求的耗时
  - 更快回退到直连，提升用户体验

- **DNSHE API URL 规范化**
  - 修正 DNSHE API 基础 URL 格式
  - baseUrl 改为纯净路径：`https://api005.dnshe.com/index.php`
  - 动态构建完整 URL，代码结构更清晰

### 🐛 Bug 修复

- **DNSHE 凭证检查改进**
  - 添加 Content-Type 检查，避免 JSON 解析 HTML 错误页面
  - 改进错误日志，显示响应预览（前 200 字符）
  - 便于诊断 API 连接问题

- **DNSHE WHOIS 类型修复**
  - 将 DNSHE WHOIS status 字符串转换为数组以符合接口规范
  - 修复类型不匹配导致的运行时错误

- **代码冗余清理**
  - 移除 scheduler.ts 中重复的 result 展开操作
  - 移除 whoisScheduler.ts 中重复的 result 展开操作
  - 避免字段冲突和覆盖

- **域名续期逻辑优化**
  - 根据 DNSHE API 文档修复域名列表获取逻辑
  - 移除 expires_at 字段（API 不返回此字段）
  - 对所有子域名尝试续期，让 API 服务端判断是否过期
  - 移除续期日志中对 expires_at 的引用

### 🎨 UI 改进

- **隐藏域名续期 Tab**
  - 暂时隐藏域名管理页面的续期 Tab
  - 保留后端功能和独立路由，未来可重新启用

## [1.3.1] - 2026-04-26

### ✨ 新增功能

- **域名管理页面重构**
  - 支持域名页面 tabs 结构（域名列表、故障转移、NS 监测）
  - DNSHE 提供商支持根域 CNAME 记录

### 🔧 架构优化

- **DNS 提供商模块化重构**
  - DNS 提供商完全模块化重构，提升代码可维护性
  - 将 _template.ts 转换为 _example 示例文件夹
  - 修复 dnsmgr 被 gitignore 忽略问题
  - 清理 DNSHE 文档文件

### 🐛 Bug 修复

- **Cloudflare 授权修复**
  - 修复 Cloudflare 授权头重复设置问题
  - 修复 Cloudflare zoneId 优先级错误导致无法获取解析记录
  - 确保使用正确的 Zone ID 调用 Cloudflare API

- **NS 监测功能修复**
  - 修复 NS 监测误报问题（DNS 污染检测优化）
  - 修复 NS 监测页面超时导致失去登录状态
  - 优化 React Query 重试策略（retry: 1, staleTime: 30s）

- **VPS8 提供商修复**
  - VPS8 解析记录操作添加详细日志
  - 修复 VPS8 record ID 类型转换问题

- **数据库兼容性修复**
  - 修复 PostgreSQL NS monitor enabled 字段类型错误

- **国际化完善**
  - 补全所有语言 i18n 翻译（英文、中文简体、雌小鬼、日语、韩语、法语、德语、西班牙语、葡萄牙语、俄语、阿拉伯语等）
  - 优化 NS 监测 UI 翻译

- **记录表单线路选择修复**
  - 修复 A、AAAA、CNAME 等记录类型缺少线路选择的问题
  - 确保所有非代理模式的提供商始终显示线路选择器
  - 修复线路表头翻译错误（显示"线路"而非"默认"）
  - 优化 `canSelectProxy` 逻辑，提升用户体验

## [1.3.0] - 2026-04-26

### ✨ 新增功能

- **VPS8 DNS 提供商支持**
  - 添加 VPS8 (vps8.zz.cd) DNS 提供商适配器
  - 支持 HTTP Basic Auth 认证（固定用户名 "client"）
  - 支持域名列表查询和到期时间获取
  - 支持代理配置（fetchWithFallback）
  - 简化配置，仅需 API Key

- **开放的 RDAP 查询服务**
  - 新增 `/api/rdap/domain/{domain}` 公开查询接口
  - 无需鉴权，完全开放访问
  - 符合 RFC 7483 国际标准格式
  - 直接调用 WHOIS/RDAP 系统，不走数据库
  - 支持 CORS 跨域访问
  - 返回标准 RDAP JSON 格式（application/rdap+json）

- **智能到期时间获取策略**
  - 根据域名类型动态调整优先级：
    - 顶域：顶域 WHOIS > DNS 提供商 API > 第三方 WHOIS
    - 子域：DNS 提供商 API > 顶域 WHOIS > 第三方 WHOIS
  - 始终执行 WHOIS 多元查询，确保获取完整信息
  - 保留顶域到期时间（apexExpiryDate）用于显示
  - 排除不准确的提供商（彩虹聚合DNS、DnsMgr）

- **RDAP 服务器列表管理**
  - 集成 IANA 官方 RDAP 服务器列表
  - 从文件缓存迁移到数据库存储
  - 自动刷新 RDAP 服务器列表
  - 支持所有域名后缀的 RDAP 查询

- **DNS 解析模块**
  - 内置 DNS 解析功能
  - 使用 Node.js http/https 模块替代 fetch
  - 加密 DNS 优先（DoH/DoT），降级明文查询
  - 改进错误处理和详细日志

- **NS 监测架构重构**
  - 重新设计 NS 监测为账号级独立设置
  - 用户级独立邮箱通知
  - 限制通知渠道权限
  - 添加 DNS 污染检测功能
  - 双重查询结果展示（加密 DNS + 普通 DNS）
  - NS 记录自动获取（加密 DNS 优先）

### 🔧 架构优化

- **WHOIS 查询策略升级**
  - 重构为分层并行竞速策略
  - 三层并发架构：
    1. 批量处理层：asyncPool 控制并发度（默认 3）
    2. 模块并发层：顶域和子域模块独立并发执行
    3. 提供商竞速层：每个模块内多个提供商并行竞速
  - 子域支持平级查询（无视域名后缀匹配）
  - 第三方查询同时查询根域名和子域名

- **数据库架构优化**
  - 修复 MySQL 迁移 IF NOT EXISTS 语法不支持问题
  - 使用 SHOW COLUMNS 检查字段存在性，消除 ERROR 日志
  - 修复 conn.execute 错误处理
  - 添加详细的数据库迁移日志
  - 修复审计日志表名不一致问题
  - 修复 MySQL 迁移函数提前返回问题

- **安全增强**
  - 加强 API 令牌授权安全限制
  - 修复 API 令牌域名操作权限控制
  - 添加权限修改功能
  - 修复令牌更新时 start_time 空字符串导致 MySQL 错误
  - 防止顶域/子域查询商注册空 suffixes 数组

### 🐛 问题修复

- **NS 监测修复**
  - 修复 NS 监测前端多个问题
  - 修复更新 NS 监测配置接口调用错误
  - 修复仪表盘 NS 监测显示问题
  - 修复 DNS 污染检测误报问题

- **域名管理修复**
  - 修复域名同步和子域判断逻辑
  - 修复子域名使用顶域到期时间时 apexExpiryDate 未定义
  - 修复子域名到期时间显示问题
  - 修复其他页面使用 domainsApi.list 的类型错误
  - 域名列表添加分页功能

- **WHOIS/RDAP 修复**
  - 修复 RDAP 查询 fetch failed 错误
  - 修复 RDAP 查询 403 错误（DigitalPlat）
  - 修复 WHOIS 模块中重复变量声明
  - 添加 .today 域名支持并修复 rdap-box URL
  - 修复第三方 RDAP 查询商匹配逻辑

- **数据库修复**
  - 修复 MySQL 迁移时重复列错误处理
  - 修复 MySQL 迁移脚本存储过程兼容性问题
  - 修复 2FA 数据库表结构和查询逻辑
  - 修复普通用户无法更改邮件通知设置的问题

- **其他修复**
  - 修复 Teams.tsx 语法错误
  - 修复 MX 记录显示优先级
  - 修复网络信息服务代理配置
  - DNS 告警邮件改为纯文本格式
  - 优化 MySQL 迁移日志级别，避免误导性 ERROR 输出

### 📝 文档更新

- 更新 CHANGELOG.md 添加 1.2.0 版本变更日志
- 添加数据库禁忌事项备注（MySQL/PostgreSQL/SQLite）
- 更新多语言国际化文件
- 优化 WHOIS 服务日志和查询逻辑说明

---

## [1.2.0] - 2026-04-24

### ✨ 新增功能

- **NS 记录监控**
  - 监测域名的 NS 记录变更
  - 自动检测 NS 劫持和配置异常
  - 支持邮件和通知渠道告警
  - 支持手动和自动检查

- **网络连通性测试**
  - 测试与 Baidu、Google、Apple、Cloudflare 的连接状态
  - 支持代理模式下的连通性测试
  - 显示各服务的延迟数据

- **团队域名权限管理**
  - 支持为团队成员分配域名权限
  - 支持子域名级别的权限控制
  - 支持读取和编辑权限设置

- **审计日志增强**
  - 添加团队操作审计（创建/更新/删除团队）
  - 添加团队成员操作审计（添加/移除成员）
  - 添加域名权限操作审计
  - 添加 DNS 账号操作审计
  - 添加 WHOIS 更新审计

### 🔧 改进

- **CI/CD 优化**
  - Docker 构建支持并行多架构构建（ARM64/AMD64）
  - 优化构建流程，提高构建效率

- **代理配置优化**
  - 支持 SOCKS5 和 HTTP(S) 代理
  - 代理配置持久化存储
  - 网络信息服务支持代理访问

- **翻译完善**
  - 补全所有语言的 NS 监控相关翻译
  - 补全团队管理相关翻译
  - 补全网络信息相关翻译
  - 添加 Mesugaki 语言特殊表达

### 🐛 问题修复

- **团队管理修复**
  - 修复团队成员角色数据截断问题（添加 `admin` 角色支持）
  - 修复添加成员时 user_id 参数缺失问题
  - 修复域名权限 API 路径不匹配问题
  - 修复成员域名权限保存失败问题
  - 修复超管角色显示为 admin 的问题

- **用户管理修复**
  - 修复用户列表角色显示问题

- **数据库修复**
  - 添加 team_members 表 role 字段迁移脚本
  - 支持 MySQL/PostgreSQL/SQLite 的 ALTER TABLE 迁移

- **其他修复**
  - 修复令牌删除确认对话框（使用自定义悬浮窗口）
  - 修复审计日志操作类型翻译缺失问题
  - 修复 JSON 格式错误

---

## [1.1.4] - 2026-04-19

### 🐛 问题修复

- **Cloudflare 适配器修复**
  - 修复记录停用/启用时 `_cloud_paused` 后缀处理逻辑
  - 简化暂停状态检测，统一使用 `_cloud_paused` 后缀
  - 修复启用记录时 `_cloud` 后缀残留导致前端显示异常的问题

---

## [1.1.3] - 2026-04-18

### 🐛 问题修复

- **WHOIS 域名支持扩展**
  - 新增 `.top` 域名 WHOIS 支持
  - 新增 `.ci` (科特迪瓦)、`.cd` (刚果民主共和国) 等国别域名支持
  - 新增 `.today`、`.tokyo`、`.tools` 等新顶级域名支持
  - 新增欧洲、非洲、亚洲多个国家域名 WHOIS 服务器配置
  - 修复 WHOIS 服务器映射表中的重复键问题

- **WHOIS 日志增强**
  - 增强 WHOIS 查询日志记录，便于诊断域名到期时间获取失败问题
  - 添加详细的错误诊断信息，包括响应预览和日期相关行提取

### 🔧 改进

- **代码质量**
  - 修复 WHOIS_SERVERS 对象中的重复键定义
  - 优化日志级别设置，关键信息使用 info 级别

---

## [1.1.2] - 2026-04-18

### 🐛 问题修复

- **CaihongDns 适配器修复**
  - 修复 `zoneId` 参数支持（DnsHelper 传递的是 zoneId 而非 domainId）
  - 修复 MX 字段类型错误（`number | undefined` → `number`）
  - 修复 baseUrl 拼接逻辑（自动处理带 `/api` 后缀的 URL）
  - 修复 API 路径以匹配官方文档（`/domain`, `/record/data/{id}` 等）
  - 修复非 JSON 响应处理（如 HTML 错误页面）

- **DnsMgr 适配器修复**
  - 修复 baseUrl 拼接逻辑（与 CaihongDns 保持一致）

- **数据库初始化修复**
  - 修复跳过初始化时的数据库连接建立问题
  - 修复现有连接未断开导致的新连接失败问题
  - 添加 `disconnect()` 调用以清理连接管理器状态

### 🔧 改进

- **类型安全**
  - 改进 CaihongDns 响应类型定义（`code` 字段改为可选）
  - 统一错误处理逻辑

---

## [1.1.1] - 2026-04-17

### 🐛 问题修复

- **数据库系统重构**
  - 统一数据库连接系统到 `db/core/connection.ts`
  - 移除旧的 `db/database.ts` 直接调用
  - 修复 PostgreSQL 触发器语法错误 (`CREATE TRIGGER IF NOT EXISTS` 不支持)
  - 修复 MySQL/SQLite/PostgreSQL schema 兼容性问题

- **2FA 功能完善**
  - 修复 2FA 设置/启用/禁用 API 路由缺失问题
  - 添加前端安全页面 (`/security`)
  - 完善 2FA 启用/禁用流程
  - 添加禁用 2FA 的确认流程

### 🔧 新增工具

- **CLI 管理工具** (`npm run cli`)
  - `disable-2fa` - 禁用指定用户的 2FA
  - `reset-db-config` - 重置数据库连接配置
  - `list-users` - 列出所有用户
  - `reset-password` - 重置用户密码

### 📝 文档更新

- 更新 API 文档，添加 2FA 相关接口
- 添加 CLI 工具使用说明

---

## [1.1.0] - 2026-04-16

### ✨ 新增功能

- **API Token 认证系统 (SOK)**
  - 支持创建和管理 API Token
  - Token 权限继承创建者用户权限
  - 支持域名级别的访问控制
  - 支持设置生效时间和过期时间
  - 完整的 Python/Node.js/cURL 示例代码

- **域名到期提醒**
  - WHOIS 自动查询域名到期时间
  - 每小时自动刷新 WHOIS 信息
  - 可配置到期前通知阈值
  - 支持邮件/Webhook 通知
  - 使用原生 Node.js 实现，兼容 pkg 打包

- **Cloudflare Tunnels 管理**
  - 在侧边栏显示 Tunnels 入口
  - 支持添加、编辑、删除 Tunnel 配置
  - 支持查看 Tunnel 状态和凭证

- **自定义背景图**
  - 支持设置登录页自定义背景图
  - 支持任意图片 URL
  - 支持 jpg/png/gif/webp 格式

- **全局 2FA 强制**
  - 管理员可强制所有用户启用 2FA
  - 支持按用户强制启用 2FA
  - 安全策略配置面板

### 🔧 架构改进

- **数据库架构优化**
  - 新增 MySQL/PostgreSQL/SQLite 独立 schema 文件
  - 自动字段迁移机制
  - 修复 `key`/`value` 保留关键字问题

- **业务适配器层完善**
  - 所有数据库操作通过业务适配器层
  - SQL 语句集中管理
  - 类型安全的 TypeScript 支持

### 🐛 问题修复

- 修复 i18n 多语言翻译完整性问题
  - 补全 ja/ko/fr/de/es/pt/ru/ar 语言文件
  - 补全 zh-CN-Mesugaki 特殊语言文件
- 修复数据库初始化时字段缺失问题
- 修复 MySQL 保留关键字冲突
- 修复 WHOIS 查询失败时的错误处理

### 📝 文档更新

- 新增完整的 API 参考文档
- 新增 API Token 使用指南
- 新增第三方对接示例 (Python/Node.js/cURL)
- 优化文档展示样式 (Docsify)

---

## [1.0.0] - 2024-12-20

### 🎉 初始版本发布

- **DNS 服务商支持**
  - 阿里云 DNS
  - 腾讯云 DNSPod
  - 华为云 DNS
  - Cloudflare
  - GoDaddy
  - 等 18+ 服务商

- **核心功能**
  - 多 DNS 账号管理
  - 域名管理
  - DNS 解析记录管理
  - 团队权限管理
  - 审计日志

- **安全特性**
  - JWT 认证
  - 双因素认证 (2FA/TOTP)
  - Passkeys 支持
  - OAuth2/OIDC 登录
  - RBAC 权限控制

- **系统特性**
  - 多数据库支持 (SQLite/MySQL/PostgreSQL)
  - 多语言支持 (10+ 语言)
  - 响应式 Web UI
  - 邮件通知 (SMTP)
  - Webhook/Telegram/DingTalk 通知

---

## 版本说明

版本号格式: `主版本号.次版本号.修订号`

- **主版本号**: 重大架构变更或不兼容更新
- **次版本号**: 新功能添加，向下兼容
- **修订号**: 问题修复，向下兼容
