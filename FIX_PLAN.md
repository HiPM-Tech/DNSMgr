# HiDNS 代码审查修复计划

**基于审查报告**: 
- DeepSeek-V4-Flash_review-20260521.md (最新)
- Kimi-K2.5_review-20250521.md (历史)

**创建日期**: 2026-05-21  
**状态**: 待执行

---

## P0 级问题（必须立即修复）

### 1. 密码重置验证码持久化 🔴

**问题**: `resetStore` 使用内存 Map 存储验证码，不支持多实例部署

**影响文件**: 
- `server/src/routes/auth.ts` (L21, L1084, L1105, L1118)

**修复方案**:
1. 创建 `password_resets` 数据库表
2. 在 `business-adapter.ts` 中添加 `PasswordResetOperations`
3. 修改 auth.ts 路由使用数据库存储

**预计工作量**: 2小时

---

### 2. 清理 legacy/ 目录 🔴

**问题**: `server/src/lib/dns/providers/legacy/` 包含20个旧版适配器文件

**影响文件**: 
- `server/src/lib/dns/providers/legacy/*.ts` (20个文件)

**修复方案**:
1. 确认所有提供商已迁移到新模块化结构
2. 删除整个 `legacy/` 目录
3. 更新相关导入语句

**预计工作量**: 1小时

---

### 3. 修复 processedCodes 内存泄漏 🔴

**问题**: Set 使用数组转换方式限制大小，存在竞态条件

**影响文件**: 
- `server/src/routes/auth.ts` (L24-27, L80-90)

**修复方案**:
1. 改用 `Map<string, number>` 带时间戳
2. 添加定期清理过期条目的逻辑
3. 或使用 TTL 缓存方案

**预计工作量**: 30分钟

---

## P1 级问题（建议尽快修复）

### 4. 统一数据库迁移管理系统 🟡

**问题**: 两套并行的迁移系统（MigrationManager vs SchemaVersionManager）

**影响文件**:
- `server/src/db/schema/migration.ts`
- `server/src/db/migration-manager.ts`
- `server/src/db/init.ts`
- `server/src/db/schema.ts`

**修复方案**:
1. 选择一套作为标准（建议使用 SchemaVersionManager）
2. 废弃另一套系统
3. 统一初始化流程

**预计工作量**: 4小时

---

### 5. 合并数据库初始化路径 🟡

**问题**: `initSchema()` 和 `initSchemaAsync()` 两套并行路径

**影响文件**:
- `server/src/db/init.ts`
- `server/src/db/schema.ts`
- `server/src/app.ts` (L347-350)

**修复方案**:
1. 合并两个函数为一个统一的初始化入口
2. 清除重复逻辑
3. 简化 app.ts 调用

**预计工作量**: 3小时

---

### 6. 重构优雅关闭代码 🟡

**问题**: SIGTERM 和 SIGINT 处理函数重复

**影响文件**:
- `server/src/app.ts` (L426-548)

**修复方案**:
1. 提取优雅关闭逻辑为共享函数 `gracefulShutdown()`
2. 两个信号处理器都调用该函数

**预计工作量**: 1小时

---

### 7. 重构 handleMySQLMigrations 🟡

**问题**: 函数长达268行，包含大量重复模式

**影响文件**:
- `server/src/db/schema.ts` (L71-L339)

**修复方案**:
1. 提取通用工具函数 `addColumnIfNotExists()`
2. 将每个迁移步骤拆分为独立函数
3. 考虑使用声明式迁移定义

**预计工作量**: 3小时

---

### 8. 修复前端 RecordForm 编辑回显 🟡

**问题**: SRV等复杂记录类型无法正确回显

**影响文件**:
- `client/src/hooks/useFormSync.ts`
- `client/src/components/RecordForm.tsx`
- `client/src/pages/Records.tsx` (L42, L226-228, L349)

**修复方案**:
1. 调试 useFormSync 的 buildFormState
2. 为 SRV 等复杂类型添加专门转换逻辑
3. 移除递增 editingKey 的绕过方案

**预计工作量**: 4小时

---

### 9. 统一 API 响应格式 🟡

**问题**: 混用 `-1` 和 HTTP 状态码作为 code 值

**影响文件**:
- `server/src/middleware/errorHandler.ts`
- `server/src/routes/auth.ts`
- `server/src/utils/http.ts`

**修复方案**:
1. 统一使用 HTTP 状态码
2. 标准化错误响应格式
3. 更新前端错误处理逻辑

**预计工作量**: 2小时

---

## P2 级问题（建议优化）

### 10. 拆分前端 API 文件 🟢

**问题**: `client/src/api/index.ts` 包含所有 API 定义

**修复方案**:
1. 按模块拆分到 `api/auth.ts`, `api/domains.ts` 等
2. 保持向后兼容的导出

**预计工作量**: 2小时

---

### 11. 迁移 CSS 到 Tailwind 🟢

**问题**: 大量独立 CSS 文件未使用 Tailwind

**影响文件**:
- Avatar.css, Header.css, Layout.css, RecordForm.css, Dashboard.css, Login.css, Setup.css, Sidebar.css, ToastContainer.css

**修复方案**:
1. 逐步将 CSS 类转换为 Tailwind 实用类
2. 删除对应的 .css 文件

**预计工作量**: 6小时

---

### 12. 清理 zh-CN-Mesugaki.json 🟢

**问题**: 娱乐性质的翻译文件不应出现在生产代码中

**修复方案**:
1. 移动到社区贡献目录或删除

**预计工作量**: 10分钟

---

### 13. 移动 Provider README.md 到 docs/ 🟢

**问题**: Markdown 文档位于源代码目录

**影响文件**:
- `server/src/lib/dns/providers/_example/README.md`
- `server/src/lib/dns/providers/dnshe/README.md`
- `server/src/lib/dns/providers/dnshe/API_V2_UPDATES.md`
- `server/src/lib/dns/providers/MIGRATION_GUIDE.md`

**修复方案**:
1. 移动到 `docs/providers/` 目录
2. 更新相关链接

**预计工作量**: 30分钟

---

### 14. 移动 ProtectedRoute.tsx 到 components/ 🟢

**问题**: 可复用组件未在 components/ 目录

**修复方案**:
1. 移动到 `client/src/components/ProtectedRoute.tsx`
2. 更新导入路径

**预计工作量**: 10分钟

---

### 15. 删除 records.ts.patch 🟢

**问题**: patch 文件不应留在源码目录

**修复方案**:
1. 直接删除文件

**预计工作量**: 5分钟

---

### 16. StubAdapter 警告提示 🟢

**问题**: 使用 StubAdapter 时无明确警告

**修复方案**:
1. 在创建 DNS 账户时检测 Stub 提供商
2. 给出明确的警告提示

**预计工作量**: 30分钟

---

### 17. Dashboard.css 模块化 🟢

**问题**: 页级别 CSS 文件未使用 CSS Modules

**修复方案**:
1. 使用 Tailwind 替代
2. 或使用 CSS Modules 命名约定

**预计工作量**: 1小时

---

## 执行顺序建议

### 第一阶段（P0 - 立即执行）
1. ✅ 密码重置验证码持久化
2. ✅ 清理 legacy/ 目录
3. ✅ 修复 processedCodes 内存泄漏

### 第二阶段（P1 - 本周内完成）
4. ⏳ 统一数据库迁移管理系统
5. ⏳ 合并数据库初始化路径
6. ⏳ 重构优雅关闭代码
7. ⏳ 重构 handleMySQLMigrations
8. ⏳ 修复前端 RecordForm 编辑回显
9. ⏳ 统一 API 响应格式

### 第三阶段（P2 - 本月内完成）
10-17. 其他优化项

---

## 总工作量估算

- **P0**: 3.5小时
- **P1**: 17小时
- **P2**: 11.5小时
- **总计**: 约32小时（4个工作日）

---

## 注意事项

1. **不要擅自 Push**: 根据 root.ai.md 第32条，修复完成后需要用户确认才能提交
2. **避免脚本**: 根据 root.ai.md 第37条，不允许使用脚本影响效率
3. **遵循规范**: 所有修复必须符合 root.ai.md 中的项目规范
4. **测试验证**: 每个修复都需要充分测试后再提交

---

**下一步**: 开始执行第一阶段（P0 级问题修复）
