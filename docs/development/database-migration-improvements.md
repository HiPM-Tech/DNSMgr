# 数据库迁移系统改进文档

## 📋 概述

本文档记录了数据库迁移系统的改进，解决了审核报告中发现的问题。

**改进日期**: 2026-05-27  
**目标版本**: v1.5.0

---

## ✅ 已完成的改进

### P0-1: 添加语义化版本号支持

#### 问题
- 之前使用 schema hash 作为版本号，无法明确区分不同版本
- 难以追踪具体哪个版本引入了哪些变更

#### 解决方案
1. **新增 `SchemaVersion` 接口** (`migration-manager.ts`)
   ```typescript
   export interface SchemaVersion {
     major: number;    // 主版本号
     minor: number;    // 次版本号
     patch: number;    // 修订号
     hash: string;     // Schema 哈希值（完整性校验）
     description?: string;
   }
   ```

2. **扩展 `MigrationRecord` 接口**
   ```typescript
   export interface MigrationRecord {
     version: string;           // Schema hash（向后兼容）
     semanticVersion?: string;  // 语义化版本（如 "1.5.0"）
     // ... 其他字段
   }
   ```

3. **更新 `schema_versions` 表结构**
   - 添加 `semantic_version VARCHAR(20)` 字段
   - 为 MySQL 添加索引 `idx_semantic_version`

4. **更新日志输出**
   ```
   之前: Schema version abc123 recorded as successful
   现在: Schema version 1.5.0 (abc123) recorded as successful
   ```

#### 影响范围
- ✅ `migration-manager.ts`: 核心逻辑更新
- ✅ `schema.ts`: 所有数据库类型的迁移调用
- ✅ 向后兼容：保留 `version` 字段用于旧数据

---

### P1-1: 添加列类型验证工具

#### 问题
- 无法自动检测列类型错误
- 迁移后无法验证约束是否正确应用

#### 解决方案
创建 `column-validator.ts` 工具模块：

1. **核心功能**
   ```typescript
   // 验证单个列
   validateColumn(conn, spec, dbType): Promise<ColumnInfo>
   
   // 批量验证
   validateColumns(conn, specs[], dbType): Promise<ColumnInfo[]>
   
   // 生成报告
   generateValidationReport(results[]): string
   ```

2. **支持的数据库**
   - ✅ MySQL (INFORMATION_SCHEMA)
   - ✅ PostgreSQL (information_schema)
   - ✅ SQLite (PRAGMA table_info)

3. **验证内容**
   - 列类型匹配（如 `VARCHAR(255)` vs `TEXT`）
   - 可空性检查（NULL vs NOT NULL）
   - 默认值验证（DEFAULT 约束）

4. **集成到迁移流程**
   ```typescript
   // schema.ts - MySQL 迁移完成后
   const criticalColumns: ColumnSpec[] = [
     {
       tableName: 'dns_accounts',
       columnName: 'enabled',
       expectedType: 'TINYINT',
       expectedNullable: false,
       expectedDefault: '1',
     },
     // ... 更多列
   ];
   
   const results = await validateColumns(conn, criticalColumns, 'mysql');
   log.info('Schema', generateValidationReport(results));
   ```

#### 示例输出
```
=== Column Validation Report ===
Total: 3, Passed: 2, Failed: 1

FAILED COLUMNS:
  - dns_accounts.enabled:
    • Default value mismatch: expected 1, got NULL

PASSED COLUMNS:
  ✓ domains.enabled (INTEGER)
  ✓ domains.name (VARCHAR(255))
```

---

### P1-2: 改进错误处理和日志

#### 问题
- 迁移失败时缺少详细的上下文信息
- 难以诊断具体问题

#### 解决方案
1. **增强日志输出**
   ```typescript
   log.info('SchemaVersion', 
     `Schema version ${this.getSemanticVersion()} (${this.schemaHash}) recorded as successful`
   );
   ```

2. **添加 TRACE 级别日志**（已在之前实现）
   - 记录 SQL 查询详情
   - 记录查询结果结构

3. **非阻塞式验证**
   - 列验证失败不会阻止启动
   - 仅记录警告，允许管理员手动修复

---

## ⚠️ 已知限制

### 1. DDL 操作不可回滚
- MySQL 的 `ALTER TABLE`、`DROP TABLE` 是隐式提交的
- 即使在外层事务中也无法回滚
- **缓解措施**: 迁移前自动备份关键数据（待实现）

### 2. 跨数据库类型差异
- 不同数据库的相同类型可能有不同名称
  - MySQL: `DATETIME` vs PostgreSQL: `TIMESTAMP`
  - SQLite: `TEXT` vs MySQL: `VARCHAR`
- **当前策略**: 每种数据库独立定义 schema

### 3. 复杂类型转换不支持
- 例如：`VARCHAR(100)` → `TEXT` 需要手动处理
- **建议**: 在重大变更前进行完整测试

---

## 📊 迁移兼容性

### 从旧版本升级路径

| 源版本 | 目标版本 | 是否支持 | 说明 |
|-------|---------|---------|------|
| < 1.0.0 | 1.5.0 | ✅ 支持 | 遗留系统自动检测 |
| 1.0.x | 1.5.0 | ✅ 支持 | 正常迁移流程 |
| 1.4.x | 1.5.0 | ✅ 支持 | 增量迁移 |
| 1.5.0 | 1.5.0 | ✅ 支持 | 幂等性保证 |

### 数据库类型支持

| 数据库 | 最低版本 | 语义化版本 | 列验证 |
|-------|---------|-----------|--------|
| MySQL | 5.7+ | ✅ | ✅ |
| PostgreSQL | 12+ | ✅ | ✅ |
| SQLite | 3.25+ | ✅ | ✅ |

---

## 🔧 使用方法

### 1. 查看当前版本

```bash
# 通过 API（待实现）
GET /api/system/schema-version

# 或直接查询数据库
SELECT semantic_version, version, applied_at 
FROM schema_versions 
WHERE success = 1 
ORDER BY applied_at DESC 
LIMIT 1;
```

### 2. 手动触发列验证

```typescript
import { validateColumns, generateValidationReport } from './db/column-validator';

const specs = [
  {
    tableName: 'domains',
    columnName: 'name',
    expectedType: 'VARCHAR',
    expectedNullable: false,
  },
];

const results = await validateColumns(conn, specs, 'mysql');
console.log(generateValidationReport(results));
```

### 3. 添加新的迁移

```typescript
// 在 schema.ts 中
const versionManager = new SchemaVersionManager(conn, mysqlSchema, {
  major: 1,
  minor: 6,  // 新版本号
  patch: 0,
  description: 'Added new feature X',
});

await executeMigration(versionManager, 'Description', async () => {
  // 迁移逻辑
});
```

---

## 📝 未来改进计划

### P0（高优先级）
- [ ] 添加迁移前置检查（磁盘空间、依赖关系）
- [ ] 实现真正的回滚机制（对于支持的事务性 DDL）
- [ ] 添加迁移测试套件（模拟各种升级路径）

### P1（中优先级）
- [ ] 自动备份关键数据 before migration
- [ ] 添加迁移进度跟踪（百分比显示）
- [ ] 支持并行迁移（多个独立变更）

### P2（低优先级）
- [ ] Web UI 显示迁移历史
- [ ] 迁移性能分析（耗时统计）
- [ ] 自动生成迁移文档

---

## 🎯 总结

本次改进显著提升了数据库迁移系统的可靠性和可维护性：

1. ✅ **语义化版本**: 清晰标识每个版本，便于追踪和管理
2. ✅ **列验证**: 自动检测类型和约束问题，减少人为错误
3. ✅ **改进日志**: 更详细的诊断信息，加速问题排查
4. ✅ **向后兼容**: 保留旧数据结构，平滑升级

**下一步**: 在生产环境部署前，务必在测试环境中验证完整的迁移流程。
