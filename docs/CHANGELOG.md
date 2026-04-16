# 更新日志

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
