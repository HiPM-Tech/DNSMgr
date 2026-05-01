# 更新日志

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
