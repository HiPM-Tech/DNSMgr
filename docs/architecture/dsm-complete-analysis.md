# DSM（声明式 Schema 管理）完整分析报告

**版本**: 1.0  
**最后更新**: 2026-06-01  
**审查轮次**: 5 轮结构审查 + 1 轮方言专项审查

---

## 目录

1. [概述](#1-概述)
2. [架构总览](#2-架构总览)
3. [审查历程](#3-审查历程)
4. [方言层分析](#4-方言层分析)
5. [最终状态](#5-最终状态)
6. [附录](#6-附录)

---

## 1. 概述

### 1.1 什么是 DSM

DSM（Declarative Schema Management）是 HiDNS 的新一代数据库初始化与迁移系统，采用**声明式**模式替代旧系统的**命令式**迁移脚本。

- **旧系统**：`init.ts` + `schema.ts`（1555 行）+ `migration-manager.ts` → 手写 SQL + 逐版本迁移函数
- **新 DSM**：`init-dsm.ts` + `schema-reconciler.ts` + `complete-schema.ts` → 定义目标状态，自动计算差异并同步

### 1.2 核心文件结构

```
server/src/db/
├── init-dsm.ts                  # DSM 主入口（Phase 0-4 编排）
├── schema-reconciler.ts         # Schema 同步引擎（802 行）
├── schema.ts                    # 旧系统存根（28 行，原 1555 行）
├── data-migration-runner.ts     # 数据迁移执行器
├── backup-manager.ts            # 备份管理器
├── migration-manager.ts         # 版本管理器（含 DSM 集成）
├── init.ts                      # 已孤立（可删除）
├── index.ts                     # 导出入口，旧导出已注释
├── types/
│   └── schema.ts                # 类型定义（ColumnDef, TableDef, IndexDef, 等）
└── schemas/
    ├── complete-schema.ts       # 完整目标 Schema（30 张表）
    ├── index.ts                 # Schema 定义聚合
    ├── sqlite.ts                # 旧 SQLite 独立定义（供参考）
    ├── mysql.ts                 # 旧 MySQL 独立定义（供参考）
    └── postgresql.ts            # 旧 PostgreSQL 独立定义（供参考）
```

---

## 2. 架构总览

### 2.1 初始化流程

```mermaid
graph TB
    A[app.ts / routes/init.ts / *.test.ts] --> B[initializeDSM]
    B --> C[Phase 0: 遗留检测]
    C --> C1[detectLegacySystem]
    C1 --> C2{schema_versions 存在?}
    C2 -->|No| C3[检查核心表]
    C2 -->|Yes| C4[检查 hidns-dsm 标记]
    C3 --> C5[遗留系统 → 自动升级]
    C4 --> C6[非 DSM 系统 → 标记升级]
    
    B --> D[Phase 1: 结构同步]
    D --> D1[SchemaReconciler.reconcile]
    D1 --> D2[备份数据库]
    D1 --> D3[逐表同步]
    D3 --> D3a[CREATE TABLE IF NOT EXISTS]
    D3 --> D3b[同步列: 添加/删除/修改]
    D3 --> D3c[同步索引]
    D3 --> D3d[同步外键]
    D1 --> D4[同步触发器/视图/存储过程]
    D1 --> D5[清理废弃表(按策略)]
    
    B --> E[Phase 2: 数据迁移]
    E --> E1[DataMigrationRunner]
    E1 --> E2[按依赖顺序执行]
    E1 --> E3[跳过已执行的迁移]
    E1 --> E4[记录到 schema_versions]
    
    B --> F[Phase 3: 完整性自检]
    F --> F1[verify]
    F1 --> F2[检查所有表存在]
    F1 --> F3[检查所有列存在]
    F1 --> F4[检查所有索引存在]
    
    B --> G[Phase 4: 版本记录]
    G --> G1[recordDSMVersion]
    G1 --> G2[schema_versions 写入]
```

### 2.2 方言适配层

```
SchemaReconciler
├── mapTypeToSQL(type, dbType)    → 抽象类型 → 方言具体类型
├── getColumnDefinitionSQL(col)   → 列定义生成（含约束）
├── generateCreateTableSQL(table) → CREATE TABLE（含 ENGINE/CHARSET）
├── isTypeCompatible(actual, expected) → 类型兼容性判断
├── formatDefaultValue(value, type, dbType) → 默认值格式化
├── escapeIdentifier(name)        → 标识符引号（`name` / "name"）
├── addColumn / dropColumn
├── modifyColumnType               → MySQL MODIFY / PG ALTER COLUMN
├── rebuildTableForSQLite          → SQLite 表重建模式
├── syncForeignKeys                → MySQL/PG 外键同步
└── syncIndexes                    → 全方言统一
```

---

## 3. 审查历程

### 3.1 一审：初始分析

**原始问题**：DSM 能否完整接替初始化与迁移？

发现 DSM 已用于 `app.ts` 但存在多个差距：

| 差距 | 严重度 | 说明 |
|------|--------|------|
| 无数据迁移能力 | P0 | 无法处理数据转换（`dnsmgr`→`hidns`等） |
| 无版本追踪 | P0 | 不写 `schema_versions` |
| 无遗留系统检测 | P1 | 不能自动识别旧版数据库 |
| SQLite DDL 受限 | P1 | 不能处理列删除和类型变更 |
| 启动后残留旧初始化 | P2 | `initSecurityPolicyTable` 等残留 |
| allowDropTable 关闭 | P3 | 废弃表不清理 |

### 3.2 二审：深度审计

发现代码库**比初审认为的更成熟**。多项功能已实现：

| 功能 | 初审认为 | 二审发现 | 位置 |
|------|---------|---------|------|
| 遗留系统检测 | ❌ | ✅ | `schema-reconciler.ts:26` |
| Schema 审计 | ❌ | ✅ | `schema-reconciler.ts:54` |
| SQLite 表重建 | ❌ | ✅ | `schema-reconciler.ts:552` |
| DropTablePolicy | ❌ | ✅ | `schema-reconciler.ts:6` |
| DataMigrationRunner | ❌ | ✅ | `data-migration-runner.ts` |
| 版本记录 | ❌ | ✅ | `init-dsm.ts:54` |

**真正剩余差距**:

| 差距 | 严重度 | 文件 |
|------|--------|------|
| `routes/init.ts` 仍用旧系统 | P0 | `routes/init.ts:353` |
| 数据迁移注册仅 2 个 | P0 | `init-dsm.ts` |
| `schema.ts` 1555 行未精简 | P1 | `schema.ts` |
| 测试文件用旧系统 | P1 | `token.test.ts`, `business-adapter.test.ts` |

### 3.3 三审：验证修改

修复状态：2/3 的 P0 已修复

| 差距 | 状态 |
|------|------|
| `routes/init.ts` 切换 DSM | ✅ **已修复** |
| `db/index.ts` 旧导出注释 | ✅ **已修复** |
| 数据迁移 2→3 个 | ⚠️ 部分修复（新增 migrate-ns-domain-name） |
| `schema.ts` 未改 | ❌ 仍 1555 行 |
| 测试文件未改 | ❌ 仍用旧系统 |

### 3.4 四审：验证第二次修改

重大进展，`schema.ts` 从 1555 → 28 行，数据迁移 3→10 个：

| 差距 | 状态 | 详情 |
|------|------|------|
| `schema.ts` 精简 | ✅ **1555→28 行** | 纯 deprecation 存根 |
| 数据迁移 3→10 个 | ✅ **全量覆盖** | 含 Export-Rebuild、去重、清理 |
| 动态版本号 | ✅ | 从 `package.json` 读取 |
| 测试文件 | ❌ **未改** | `initSchemaAsync` 已为空存根 |

### 3.5 五审：终审

**所有差距关闭！** DSM 完整接替初始化与迁移。

| 检查项 | 状态 |
|--------|------|
| `token.test.ts` 使用 DSM | ✅ `initializeDSM` |
| `business-adapter.test.ts` 使用 DSM | ✅ `initializeDSM` |
| 全局无旧 `initSchemaAsync` 引用 | ✅ |
| `schema.ts` 剩余 28 行 | ✅ 仅存根 |
| `db/init.ts` | ∘ 已孤立（可删除） |

### 3.6 六审：方言专项审查

见下一节完整报告。

---

## 4. 方言层分析

### 4.1 类型映射

| 抽象类型 | SQLite | MySQL | PostgreSQL | 状态 |
|---------|--------|-------|-----------|------|
| `id` | INTEGER | INTEGER | SERIAL | ✅ |
| `number` | BIGINT | BIGINT | BIGINT | ✅ |
| `boolean` | INTEGER | TINYINT(1) | BOOLEAN | ✅ |
| `datetime` | DATETIME | DATETIME | TIMESTAMPTZ | ✅ |
| `json` | TEXT | JSON | JSONB | ✅ |
| `string(n)` | TEXT | VARCHAR(n) | VARCHAR(n) | ✅ |
| `string`(无长度) | TEXT | TEXT | TEXT | ✅ |

### 4.2 发现的 BUG

#### BUG #1（P0）：`ColumnDef.unique` 未实现

`types/schema.ts` 定义了 `unique?: boolean`，但 `getColumnDefinitionSQL()` 未处理。

**影响**：17 个列的 UNIQUE 约束缺失：

| 表 | 列 |
|----|----|
| users | username |
| user_preferences | user_id |
| user_security_settings | user_id |
| user_sessions | token |
| user_tokens | token_hash |
| failover_status | config_id |
| ns_monitor_status | config_id |
| user_ns_monitor_prefs | user_id |
| rdap_server_cache | tld |
| system_cache | cache_key |
| whois_cache | domain_name |
| schema_versions | version |
| mcp_user_api_keys | api_key |
| mcp_oauth_clients | client_id |
| mcp_oauth_authorization_codes | code |
| mcp_oauth_access_tokens | access_token |
| mcp_oauth_access_tokens | refresh_token |

**修复**：在 `getColumnDefinitionSQL()` 增加一行：

```typescript
if (col.unique) def += ' UNIQUE';
```

#### BUG #2（P1）：MySQL `DROP FOREIGN KEY` 语法错误

`dropForeignKey()` 使用 `DROP CONSTRAINT IF EXISTS`，但 MySQL 使用 `DROP FOREIGN KEY` 且不支持 `IF EXISTS`。

**修复**：区分方言：

```typescript
if (dbType === 'mysql') {
  await this.conn.execute(`ALTER TABLE ${table} DROP FOREIGN KEY ${constraint}`);
} else if (dbType === 'postgresql') {
  await this.conn.execute(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraint}`);
}
```

### 4.3 数据完整性缺陷

#### 缺失 `team_members` 唯一约束

旧 `sqlite.ts:75`：`UNIQUE(team_id, user_id)`
`complete-schema.ts`：**缺失**

**修复**：在 team_members 索引中补充：

```typescript
{ name: 'uq_team_members', columns: ['team_id', 'user_id'], unique: true }
```

### 4.4 重要 ISSUE

| Issue | 严重度 | 说明 | 当前影响 |
|-------|--------|------|---------|
| `isTypeCompatible` 忽略长度 | P2 | VARCHAR(N) 的长度变化不被检测 | 字段长度永远不会被同步 |
| MySQL `MODIFY COLUMN` 不保留约束 | P2 | 只指定类型，NOT NULL/DEFAULT 可能丢失 | 极少触发（类型变更场景） |
| MySQL FK 命名不兼容 | P3 | 旧系统自动命名 vs DSM 固定命名 | 首次迁移后出现噪音日志 |

### 4.5 SQLite 专项评分

| 特性 | 状态 |
|------|------|
| PRAGMA table_info 列检测 | ✅ |
| 表重建（含事务保护+索引重建） | ✅ |
| AUTOINCREMENT | ✅ |
| DROP COLUMN 回退到表重建 | ✅ |
| DEFAULT CURRENT_TIMESTAMP | ✅ |
| JSON 存储为 TEXT | ✅ |
| 存储过程跳过 | ✅ |
| 外键同步跳过 | ✅ |
| boolean 默认值 1/0 | ✅ |

---

## 5. 最终状态

### 5.1 当前注册的数据迁移（10 个）

| 迁移 ID | 描述 | 依赖 |
|---------|------|------|
| `migrate-dns-account-type` | `dnsmgr` → `hidns` 类型升级 | - |
| `init-security-policies` | 默认安全策略 | - |
| `migrate-ns-domain-name` | 填充 `domain_name` | init-security-policies |
| `migrate-domains-whois-fields` | `apex_expires_at` + `whois_status` | migrate-ns-domain-name |
| `migrate-domains-enabled` | `domains.enabled` | migrate-domains-whois-fields |
| `migrate-dns-accounts-enabled-rebuild` | Export-Rebuild + SQLite 兼容 | migrate-domains-enabled |
| `migrate-ns-monitor-cleanup` | 去重 + `domain_id` 删除 | migrate-domains-whois-fields |
| `cleanup-old-ns-tables` | 删除废弃 NS 表 | migrate-ns-monitor-cleanup |

### 5.2 所有初始化和迁移路径

```
app.ts 启动
  └─ initializeDSM()
       ├─ Phase 0: detectLegacySystem()
       ├─ Phase 1: reconcile(COMPLETE_SCHEMA)     ← 30 张表
       ├─ Phase 2: DataMigrationRunner.run()       ← 10 个迁移
       ├─ Phase 3: verify()                         ← 完整性自检
       └─ Phase 4: recordDSMVersion()              ← 版本写入

routes/init.ts 设置向导
  └─ initializeDSM()                               ← 同上

*.test.ts 测试
  └─ initializeDSM()                               ← 同上
```

所有生产路径和测试路径已统一。

### 5.3 遗留系统情况

| 文件 | 行数 | 状态 | 说明 |
|------|------|------|------|
| `schema.ts` | 28 | ✅ 存根 | 仅 deprecation 警告 |
| `db/index.ts` | - | ✅ 已注释 | 旧导出已注释 |
| `init.ts` | 355 | ∘ 孤立 | 可安全删除 |

### 5.4 待办收尾

| 任务 | 优先级 | 工作量 |
|------|--------|--------|
| 修复 BUG #1：实现 `unique` 约束 | P0 | 1 行 |
| 修复完整性缺陷：`team_members` 唯一索引 | P0 | 1 行 |
| 修复 BUG #2：MySQL DROP FOREIGN KEY 语法 | P1 | 3 行 |
| 删除 `db/init.ts`（已孤立） | P2 | 2 分钟 |
| 修复 Issue #2：MySQL MODIFY COLUMN 保留约束 | P2 | 5 行 |
| 评估 Issue #1：类型兼容性长度检测 | P2 | - |

---

## 6. 附录

### 6.1 COMPLETE_SCHEMA 表清单（30 张）

| # | 表名 | 模块 | 列数 | 索引数 | 外键数 |
|---|------|------|------|--------|--------|
| 1 | users | 用户与认证 | 9 | 3 | 0 |
| 2 | teams | 用户与认证 | 5 | 1 | 1 |
| 3 | team_members | 用户与认证 | 5 | 2 | 2 |
| 4 | dns_accounts | DNS 账户与域名 | 9 | 4 | 2 |
| 5 | domains | DNS 账户与域名 | 12 | 4 | 1 |
| 6 | domain_permissions | DNS 账户与域名 | 6 | 3 | 3 |
| 7 | dns_records | DNS 记录 | 12 | 1 | 1 |
| 8 | operation_logs | 操作日志 | 6 | 4 | 0 |
| 9 | oauth_user_links | OAuth | 7 | 1 | 1 |
| 10 | oauth_states | OAuth | 6 | 1 | 0 |
| 11 | runtime_secrets | 会话与安全 | 3 | 0 | 0 |
| 12 | user_2fa | 会话与安全 | 8 | 1 | 1 |
| 13 | webauthn_credentials | 会话与安全 | 10 | 0 | 1 |
| 14 | user_sessions | 会话与安全 | 8 | 3 | 1 |
| 15 | login_attempts | 会话与安全 | 7 | 3 | 0 |
| 16 | password_resets | 会话与安全 | 4 | 1 | 0 |
| 17 | system_settings | 会话与安全 | 3 | 0 | 0 |
| 18 | user_preferences | 用户偏好与 Token | 11 | 1 | 1 |
| 19 | user_tokens | 用户偏好与 Token | 12 | 2 | 1 |
| 20 | failover_configs | 故障转移 | 16 | 2 | 2 |
| 21 | failover_status | 故障转移 | 11 | 1 | 1 |
| 22 | security_policies | 安全策略 | 11 | 0 | 0 |
| 23 | user_security_settings | 安全策略 | 5 | 1 | 1 |
| 24 | trusted_devices | 安全策略 | 9 | 2 | 1 |
| 25 | ns_monitor_configs | NS 监控 | 10 | 2 | 2 |
| 26 | ns_monitor_status | NS 监控 | 9 | 1 | 1 |
| 27 | ns_monitor_alerts | NS 监控 | 8 | 1 | 1 |
| 28 | user_ns_monitor_prefs | NS 监控 | 7 | 1 | 1 |
| 29 | ns_monitor_domains | NS 监控 | 15 | 3 | 1 |
| 30 | rdap_server_cache | 缓存 | 5 | 1 | 0 |
| 31 | system_cache | 缓存 | 6 | 2 | 0 |
| 32 | renewable_domains | 域名续期 | 14 | 4 | 1 |
| 33 | whois_cache | WHOIS 缓存 | 6 | 2 | 0 |
| 34 | schema_versions | 系统版本追踪 | 9 | 4 | 0 |
| 35 | mcp_global_config | MCP | 6 | 0 | 1 |
| 36 | mcp_user_api_keys | MCP | 9 | 0 | 1 |
| 37 | mcp_oauth_clients | MCP | 9 | 0 | 1 |
| 38 | mcp_oauth_authorization_codes | MCP | 9 | 0 | 2 |
| 39 | mcp_oauth_access_tokens | MCP | 9 | 0 | 2 |
| 40 | mcp_audit_logs | MCP | 8 | 0 | 1 |

### 6.2 审查关键词路线

```
一审（初始分析）
  └─ 发现7个差距 → 生成优化文档
二审（深度审计）
  └─ 修正：5/7差距已实现 → 发现真正剩余3个
三审（验证第一次修改）
  └─ 2/3已修复 → schema.ts未改
四审（验证第二次修改）
  └─ schema.ts 1555→28行 ✅ → 测试文件未改
五审（终审）
  └─ 所有差距关闭 ✅ → init.ts可删除
六审（方言专项）
  └─ 发现2个BUG + 1个完整性缺陷 → 评为⭐⭐⭐⭐
```

### 6.3 术语对照

| 术语 | 说明 |
|------|------|
| DSM | Declarative Schema Management，声明式 Schema 管理 |
| COMPLETE_SCHEMA | 定义在 `complete-schema.ts` 的目标数据库状态 |
| SchemaReconciler | 核心引擎，计算目标状态与实际状态的差异并同步 |
| DataMigrationRunner | 数据迁移执行器，处理结构同步后的数据转换 |
| legacy detection | 检测数据库是否为旧系统（非 DSM 管理） |
| SQLite table rebuild | SQLite 下通过 CREATE TABLE AS SELECT 模式完成列变更 |
| DropTablePolicy | 废弃表删除安全策略（never/dry-run-only/safe-only/always） |