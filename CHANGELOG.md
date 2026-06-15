# Changelog

## [2.0.4] - 2026-06-15

### 🚀 新功能
- **dpdns_reverse 提供商**: 新增 DigitalPlat Domains 逆向实现，支持 free 域名列表拉取、续期及定时调度
- **账号按用途过滤**: GET /api/accounts?purpose=dns|renewal 后端过滤，前端域名列表/续费页使用
- **i18n 国际化**: 新增多语言支持（中/英/日/韩/法/德/西/葡/俄/阿），替换 useTranslation 为 useI18n
- **服务商名称本地化**: Accounts 页面、域名列表编辑页、域名续费页使用 t('provider.xxx') 国际化 key

### 🐛 Bug 修复
- **MySQL LIMIT/OFFSET**: 修复 prepared statement 不支持 LIMIT/OFFSET 参数绑定，改为内联整数
- **MySQL 日期格式**: parseDpdnsDate 输出 ISO 8601 格式导致 DATETIME 列写入失败，改为 YYYY-MM-DD HH:mm:ss
- **通知渠道无法添加**: NotificationChannels useEffect 用 API 数据覆盖本地未保存的新 channel，新增编辑中跳过逻辑
- **DSM schema 重建 NOT NULL 冲突**: rebuildTableForSQLite 在 INSERT...SELECT 时对 NOT NULL 列使用 IFNULL 兜底默认值
- **dpdns_reverse 认证**: 添加完整 Chrome 131 浏览器请求头绕过风控拦截
- **Dashboard 提供商分布**: 修复 provider 名称 i18n key 错误

### 🔧 优化
- dpdns_reverse 认证头优化
- 分页参数类型安全处理
- schema-reconciler 字段迁移兼容性提升
- Provider 注册表添加 dns/renewal 能力标识

## [2.0.3] - 2026-06-13

### 🚀 新功能
- WHOIS 缓存添加 creation_date 字段支持
- 新增查询模式过滤、状态规范化与平级查询控制

### 🐛 Bug 修复
- WHOIS 缓存查询性能优化
- 修复部分域名查询结果不准确的问题

## [2.0.2] - 2026-06-10

### 🚀 新功能
- 新增域名批量操作功能
- NS 监控告警接收人配置

### 🐛 Bug 修复
- 修复 NS 监控告警重复发送问题
- 修复服务监控 SSL 证书检测超时问题

## [2.0.1] - 2026-06-05

### 🐛 Bug 修复
- 修复 Docker 部署时数据库连接问题
- 修复部分浏览器兼容性问题

## [2.0.0] - 2026-06-01

### 🚀 新功能
- 全新 UI 界面，基于 TDesign React 重构
- 多语言国际化支持（i18n）
- 服务监控（SSL证书、Endpoint、DNS故障转移）
- NS 监控（DNS 污染检测）
- 审计规则引擎
- 通知渠道（Webhook/Telegram/DingTalk/Email）
- 团队协作与权限管理
- 登录限制与账户锁定
- 暗色模式
