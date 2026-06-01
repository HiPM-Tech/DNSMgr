import { getConnection } from './connection';
import { DatabaseSchema, TableDef, ColumnDef, TriggerDef, ViewDef, ProcedureDef } from './types/schema';
import { BackupManager } from './backup-manager';
import { log } from '../lib/logger';

export type DropTablePolicy = 'never' | 'dry-run-only' | 'safe-only' | 'always';

export interface ReconcileOptions {
  dryRun?: boolean;
  dropTablePolicy?: DropTablePolicy;
  forceBackup?: boolean;
}

export class SchemaReconciler {
  private conn: any;
  private backupManager: BackupManager;

  constructor() {
    this.conn = getConnection();
    this.backupManager = new BackupManager();
  }

  /**
   * 检测是否为遗留系统（非 HiDNS DSM 管理的数据库）
   */
  async detectLegacySystem(): Promise<{ isLegacy: boolean; reason?: string }> {
    const versionTableExists = await this.tableExists('schema_versions');
    if (!versionTableExists) {
      // 如果连版本表都没有，但有核心业务表，说明是极早期的遗留系统
      const hasDomains = await this.tableExists('domains');
      const hasUsers = await this.tableExists('users');
      if (hasDomains || hasUsers) {
        return { isLegacy: true, reason: 'No schema_versions table found, but core tables exist.' };
      }
      return { isLegacy: false }; // 全新空库
    }

    // 检查是否有 HiDNS DSM 的记录标记
    const result = await this.conn.get(
      "SELECT COUNT(*) as cnt FROM schema_versions WHERE system_type = 'hidns-dsm' AND success = 1"
    );
    const hasDSMRecord = (result as any)?.cnt > 0;

    if (!hasDSMRecord) {
      return { isLegacy: true, reason: 'schema_versions exists but no HiDNS-DSM records found.' };
    }

    return { isLegacy: false };
  }

  /**
   * Schema 完整性审计（开发期使用）
   */
  async auditSchema(targetSchema: DatabaseSchema): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    const existingTables = await this.getAllTables();
    
    // 1. 检查目标表是否都在数据库中存在
    for (const table of targetSchema.tables) {
      if (!existingTables.includes(table.name)) {
        issues.push(`Table missing in database: ${table.name}`);
      } else {
        // 2. 检查列覆盖率
        const dbCols = await this.getTableColumns(table.name);
        const dbColNames = new Set(dbCols.map((c: any) => c.name.replace(/["'`]/g, '')));
        for (const col of table.columns) {
          if (!dbColNames.has(col.name)) {
            issues.push(`Column missing in ${table.name}: ${col.name}`);
          }
        }
      }
    }

    // 3. 检查数据库中是否存在未在 Schema 中定义的“幽灵表”
    const targetTableNames = new Set(targetSchema.tables.map(t => t.name));
    for (const tableName of existingTables) {
      if (!tableName.startsWith('sqlite_') && !targetTableNames.has(tableName)) {
        issues.push(`Ghost table found in database (not in schema): ${tableName}`);
      }
    }

    return { valid: issues.length === 0, issues };
  }

  // 模拟 IDatabaseAdapter 接口，直到我们完全迁移过去
  private async getAllTables(): Promise<string[]> {
    const type = this.conn.type;
    if (type === 'sqlite') {
      const rows = await this.conn.query(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`);
      return rows.map((r: any) => r.name);
    } else if (type === 'mysql') {
      const rows = await this.conn.query("SELECT TABLE_NAME as name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()");
      return rows.map((r: any) => r.name);
    } else if (type === 'postgresql') {
      const rows = await this.conn.query("SELECT tablename as name FROM pg_tables WHERE schemaname = 'public'");
      return rows.map((r: any) => r.name);
    }
    return [];
  }

  private async tableExists(tableName: string): Promise<boolean> {
    const type = this.conn.type;
    if (type === 'sqlite') {
      const res = await this.conn.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [tableName]);
      return !!res;
    } else if (type === 'mysql') {
      const res = await this.conn.get("SELECT TABLE_NAME as name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [tableName]);
      return !!res;
    } else if (type === 'postgresql') {
      const res = await this.conn.get("SELECT tablename as name FROM pg_tables WHERE schemaname = 'public' AND tablename = ?", [tableName]);
      return !!res;
    }
    return false;
  }

  private async getTableColumns(tableName: string): Promise<any[]> {
    const type = this.conn.type;
    if (type === 'sqlite') {
      return this.conn.query(`PRAGMA table_info(${tableName})`);
    } else if (type === 'mysql') {
      return this.conn.query(
        `SELECT COLUMN_NAME as name, DATA_TYPE as type, IS_NULLABLE as nullable, COLUMN_DEFAULT as defaultValue 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [tableName]
      );
    } else if (type === 'postgresql') {
      return this.conn.query(
        `SELECT column_name as name, data_type as type, is_nullable as nullable, column_default as defaultValue 
         FROM information_schema.columns 
         WHERE table_schema = 'public' AND table_name = $1`,
        [tableName]
      );
    }
    return [];
  }

  private async addColumn(table: string, column: string, definition: string): Promise<void> {
    // definition should already include the escaped column name
    await this.conn.execute(`ALTER TABLE ${this.escapeIdentifier(table)} ADD COLUMN ${definition}`);
  }

  private async dropColumn(table: string, column: string): Promise<void> {
    const dbType = this.getDbType();
    if (dbType === 'sqlite') {
      // SQLite 3.35.0+ 支持 DROP COLUMN，但为了兼容性我们使用表重建
      log.warn('Schema', `Using table rebuild for SQLite DROP COLUMN: ${table}.${column}`);
      return; // 由 syncColumns 统一处理重建
    }
    await this.conn.execute(`ALTER TABLE ${this.escapeIdentifier(table)} DROP COLUMN ${this.escapeIdentifier(column)}`);
  }

  private async modifyColumnType(table: string, column: string, newType: string): Promise<void> {
    const dbType = this.getDbType();
    if (dbType === 'sqlite') {
      // SQLite 不支持直接修改列类型，需要重建表
      log.warn('Schema', `Using table rebuild for SQLite type modification: ${table}.${column}`);
      return; // 由 syncColumns 统一处理重建
    }
    
    // PostgreSQL: SERIAL is a pseudo-type, cannot be used in ALTER COLUMN
    if (dbType === 'postgresql' && newType === 'SERIAL') {
      log.warn('Schema', `Skipping type modification to SERIAL for ${table}.${column} (SERIAL is a pseudo-type)`);
      return;
    }
    
    if (dbType === 'postgresql') {
      // PostgreSQL requires three steps for type conversion with default values:
      // 1. DROP DEFAULT
      // 2. ALTER TYPE with USING clause
      // 3. SET DEFAULT (if needed)
      await this.conn.execute(`ALTER TABLE ${this.escapeIdentifier(table)} ALTER COLUMN ${this.escapeIdentifier(column)} DROP DEFAULT`);
      
      let sql = `ALTER TABLE ${this.escapeIdentifier(table)} ALTER COLUMN ${this.escapeIdentifier(column)} TYPE ${newType}`;
      
      // Add USING clause for specific type conversions that require explicit casting
      if (newType === 'BOOLEAN' || newType === 'BIGINT' || newType === 'TIMESTAMPTZ') {
        sql += ` USING ${this.escapeIdentifier(column)}::${newType}`;
      }
      
      await this.conn.execute(sql);
    } else if (dbType === 'mysql') {
      await this.conn.execute(`ALTER TABLE ${this.escapeIdentifier(table)} MODIFY COLUMN ${this.escapeIdentifier(column)} ${newType}`);
    }
  }

  private isTypeCompatible(actual: string, expected: string): boolean {
    // 简单类型兼容性检查
    const normalize = (t: string) => t.toUpperCase().replace(/\(.*?\)/g, '');
    return normalize(actual) === normalize(expected);
  }

  private async execute(sql: string): Promise<void> {
    await this.conn.execute(sql);
  }

  private escapeIdentifier(name: string): string {
    const dbType = this.getDbType();
    if (dbType === 'mysql') return `\`${name}\``;
    return `"${name}"`;
  }

  private getDbType(): string {
    return this.conn.type;
  }

  /**
   * 同步 Schema 到数据库
   * @param schema 目标 Schema 定义
   * @param options 配置项（如是否强制备份、是否仅预览）
   */
  async reconcile(schema: DatabaseSchema, options: ReconcileOptions = {}): Promise<void> {
    const { dryRun = false, dropTablePolicy = 'never', forceBackup = true } = options;
    const dbType = this.getDbType();
    log.info('Schema', `Starting reconciliation for ${dbType} (Version: ${schema.version})...`);

    if (options.dryRun) {
      log.warn('Schema', 'DRY RUN MODE: No changes will be applied to the database.');
    }

    // 1. 执行备份 (仅在非预览模式下)
    if (!options.dryRun && options.forceBackup !== false) {
      try {
        await this.backupManager.createBackup(dbType);
        // 清理旧备份
        this.backupManager.cleanup(7); 
      } catch (err) {
        log.error('Schema', 'Backup failed! Aborting reconciliation to protect data.', err);
        // Check if we should continue despite backup failure
        const continueOnFail = process.env.DSM_BACKUP_REQUIRED !== 'true';
        if (continueOnFail) {
          log.warn('Schema', 'DSM_BACKUP_REQUIRED is not set to true, continuing with reconciliation...');
        } else {
          throw err;
        }
      }
    }

    // 2. 检测并删除不再需要的表（根据安全策略）
    if (dropTablePolicy !== 'never') {
      await this.syncTablesDeletion(schema.tables, dryRun, dropTablePolicy);
    }

    // 3. 逐表同步
    for (const tableDef of schema.tables) {
      await this.syncTable(tableDef, options.dryRun || false);
    }

    // 4. 同步触发器、视图和存储过程
    if (schema.triggers) {
      for (const trigger of schema.triggers) {
        await this.syncTrigger(trigger, options.dryRun || false);
      }
    }

    if (schema.views) {
      for (const view of schema.views) {
        await this.syncView(view, options.dryRun || false);
      }
    }

    if (schema.procedures) {
      for (const proc of schema.procedures) {
        await this.syncProcedure(proc, options.dryRun || false);
      }
    }

    log.info('Schema', 'Reconciliation completed successfully.');
  }

  /**
   * 完整性检查：验证当前数据库是否完全符合 Schema 定义
   */
  async verify(schema: DatabaseSchema): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    for (const tableDef of schema.tables) {
      const exists = await this.tableExists(tableDef.name);
      if (!exists) {
        issues.push(`Missing table: ${tableDef.name}`);
        continue;
      }

      const existingCols = await this.getTableColumns(tableDef.name);
      const existingNames = new Set(existingCols.map((c: any) => c.name.replace(/["'`]/g, '')));
      
      for (const col of tableDef.columns) {
        if (!existingNames.has(col.name)) {
          issues.push(`Missing column: ${tableDef.name}.${col.name}`);
        }
      }

      if (tableDef.indexes) {
        for (const idx of tableDef.indexes) {
          if (!(await this.indexExists(idx.name))) {
            issues.push(`Missing index: ${idx.name}`);
          }
        }
      }
    }

    return { valid: issues.length === 0, issues };
  }

  private async syncTable(tableDef: TableDef, dryRun: boolean): Promise<void> {
    const exists = await this.tableExists(tableDef.name);

    if (!exists) {
      const sql = this.generateCreateTableSQL(tableDef);
      if (dryRun) {
        log.info('Schema [DRY RUN]', `Would create table: ${tableDef.name}`);
        log.info('Schema [DRY RUN]', `SQL: ${sql}`);
      } else {
        log.info('Schema', `Creating new table: ${tableDef.name}`);
        await this.execute(sql);
      }
    } else {
      log.debug('Schema', `Table ${tableDef.name} exists, checking columns and indexes...`);
      await this.syncColumns(tableDef, dryRun);
      await this.syncIndexes(tableDef, dryRun);
      // 注意：SQLite 对外键支持有限，通常在 CREATE TABLE 时定义
      if (this.getDbType() !== 'sqlite') {
        await this.syncForeignKeys(tableDef, dryRun);
      }
    }
  }

  /**
   * 检测并删除不再由 DSM 管理的表
   */
  private async syncTablesDeletion(targetTables: TableDef[], dryRun: boolean, policy: DropTablePolicy): Promise<void> {
    if (policy === 'never') return;

    const dbType = this.getDbType();
    const targetNames = new Set(targetTables.map(t => t.name.toLowerCase()));
    
    // 获取数据库中所有表
    let existingTables: string[] = [];
    if (dbType === 'sqlite') {
      const rows = await this.conn.query(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`);
      existingTables = rows.map((r: any) => r.name.toLowerCase());
    } else if (dbType === 'mysql') {
      const rows = await this.conn.query("SELECT TABLE_NAME as name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()");
      existingTables = rows.map((r: any) => r.name.toLowerCase());
    } else if (dbType === 'postgresql') {
      const rows = await this.conn.query("SELECT tablename as name FROM pg_tables WHERE schemaname = 'public'");
      existingTables = rows.map((r: any) => r.name.toLowerCase());
    }

    for (const tableName of existingTables) {
      if (!targetNames.has(tableName)) {
        // 保护系统表
        if (tableName.startsWith('sqlite_') || tableName === 'schema_versions') {
          continue;
        }

        // 策略逻辑
        if (policy === 'dry-run-only') {
          log.warn('Schema [DRY RUN]', `Would drop table (policy: dry-run-only): ${tableName}`);
          continue;
        }

        if (policy === 'safe-only') {
          // 检查表是否为空
          const countRes = await this.conn.get(`SELECT COUNT(*) as cnt FROM ${this.escapeIdentifier(tableName)}`);
          const rowCount = (countRes as any)?.cnt || 0;
          if (rowCount > 0) {
            log.warn('Schema', `Skipping non-empty table (policy: safe-only): ${tableName} (${rowCount} rows)`);
            continue;
          }
        }

        if (dryRun) {
          log.warn('Schema [DRY RUN]', `Would drop table: ${tableName}`);
        } else {
          log.warn('Schema', `Dropping obsolete table (policy: ${policy}): ${tableName}`);
          await this.dropTable(tableName);
        }
      }
    }
  }

  private async dropTable(tableName: string): Promise<void> {
    await this.conn.execute(`DROP TABLE IF EXISTS ${this.escapeIdentifier(tableName)}`);
  }

  private async syncForeignKeys(tableDef: TableDef, dryRun: boolean): Promise<void> {
    const dbType = this.getDbType();
    if (!tableDef.foreignKeys || dbType === 'sqlite') return;
    
    // 获取现有的外键约束
    const existingFKs = await this.getTableForeignKeys(tableDef.name);
    const existingFKNames = new Set(existingFKs.map((fk: any) => fk.constraint_name));
    
    const targetFKNames = new Set<string>();

    for (const fk of tableDef.foreignKeys) {
      const constraintName = `fk_${tableDef.name}_${fk.column}`;
      targetFKNames.add(constraintName);
      
      // 检查外键是否存在
      if (!existingFKNames.has(constraintName)) {
        // 添加新的外键
        let sql = '';
        if (dbType === 'mysql' || dbType === 'postgresql') {
          sql = `ALTER TABLE ${this.escapeIdentifier(tableDef.name)} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${fk.column}) REFERENCES ${fk.refTable}(${fk.refColumn}) ON DELETE ${fk.onDelete || 'NO ACTION'}`;
        }

        if (sql) {
          if (dryRun) {
            log.info('Schema [DRY RUN]', `Would add FK: ${constraintName}`);
          } else {
            try {
              await this.execute(sql);
              log.info('Schema', `Added foreign key constraint: ${constraintName}`);
            } catch (e: any) {
              if (e.message?.includes('Duplicate key') || e.message?.includes('already exists')) {
                log.debug('Schema', `FK ${constraintName} already exists.`);
              } else {
                log.warn('Schema', `Failed to add FK ${constraintName}:`, e);
              }
            }
          }
        }
      } else {
        // TODO: 检查外键定义是否匹配，如果不匹配则删除并重建
        log.debug('Schema', `FK ${constraintName} already exists, skipping.`);
      }
    }

    // 删除多余的外键约束（在 Schema 定义中不存在的）
    for (const existingFKName of existingFKNames) {
      if (!targetFKNames.has(existingFKName)) {
        if (dryRun) {
          log.warn('Schema [DRY RUN]', `Would drop FK: ${existingFKName}`);
        } else {
          log.warn('Schema', `Dropping obsolete FK: ${existingFKName}`);
          await this.dropForeignKey(tableDef.name, existingFKName);
        }
      }
    }
  }

  private async getTableForeignKeys(tableName: string): Promise<any[]> {
    const dbType = this.getDbType();
    if (dbType === 'mysql') {
      return this.conn.query(
        `SELECT CONSTRAINT_NAME as constraint_name, COLUMN_NAME as column_name, 
         REFERENCED_TABLE_NAME as ref_table, REFERENCED_COLUMN_NAME as ref_column,
         DELETE_RULE as delete_rule
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
        [tableName]
      );
    } else if (dbType === 'postgresql') {
      return this.conn.query(
        `SELECT tc.constraint_name, kcu.column_name, 
         ccu.table_name AS ref_table, ccu.column_name AS ref_column,
         rc.delete_rule
         FROM information_schema.table_constraints AS tc 
         JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
         JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
         JOIN information_schema.referential_constraints AS rc ON rc.constraint_name = tc.constraint_name
         WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1`,
        [tableName]
      );
    }
    return [];
  }

  private async dropForeignKey(tableName: string, constraintName: string): Promise<void> {
    const dbType = this.getDbType();
    if (dbType === 'mysql') {
      // MySQL 不支持 IF EXISTS，且使用 DROP FOREIGN KEY
      try {
        await this.conn.execute(`ALTER TABLE ${this.escapeIdentifier(tableName)} DROP FOREIGN KEY ${this.escapeIdentifier(constraintName)}`);
      } catch (err) {
        log.debug('Schema', `FK ${constraintName} not found or already dropped`);
      }
    } else if (dbType === 'postgresql') {
      await this.conn.execute(`ALTER TABLE ${this.escapeIdentifier(tableName)} DROP CONSTRAINT IF EXISTS ${this.escapeIdentifier(constraintName)}`);
    }
  }

  private async indexExists(indexName: string): Promise<boolean> {
    const type = this.conn.type;
    if (type === 'sqlite') {
      const res = await this.conn.get(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`, [indexName]);
      return !!res;
    } else if (type === 'mysql') {
      const res = await this.conn.get("SELECT INDEX_NAME as name FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME = ?", [indexName]);
      return !!res;
    } else if (type === 'postgresql') {
      const res = await this.conn.get("SELECT indexname as name FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1", [indexName]);
      return !!res;
    }
    return false;
  }

  private async syncIndexes(tableDef: TableDef, dryRun: boolean): Promise<void> {
    if (!tableDef.indexes) return;

    for (const idx of tableDef.indexes) {
      const exists = await this.indexExists(idx.name);
      if (!exists) {
        const uniqueStr = idx.unique ? 'UNIQUE' : '';
        const cols = idx.columns.map(c => this.escapeIdentifier(c)).join(', ');
        const sql = `CREATE ${uniqueStr} INDEX IF NOT EXISTS ${this.escapeIdentifier(idx.name)} ON ${this.escapeIdentifier(tableDef.name)} (${cols})`;
        if (dryRun) {
          log.info('Schema [DRY RUN]', `Would add index: ${idx.name}`);
          log.info('Schema [DRY RUN]', `SQL: ${sql}`);
        } else {
          log.info('Schema', `Adding missing index: ${idx.name}`);
          await this.execute(sql);
        }
      }
    }
  }

  private async syncColumns(tableDef: TableDef, dryRun: boolean): Promise<void> {
    const existingCols = await this.getTableColumns(tableDef.name);
    // Normalize column names to handle quoted identifiers (especially for SQLite)
    const existingNames = new Set(existingCols.map((c: any) => c.name.replace(/["'`]/g, '')));
    const targetNames = new Set(tableDef.columns.map(c => c.name));

    // 1. 添加缺失的列
    for (const col of tableDef.columns) {
      if (!existingNames.has(col.name)) {
        const def = this.getColumnDefinitionSQL(col);
        if (dryRun) {
          log.info('Schema [DRY RUN]', `Would add column: ${tableDef.name}.${col.name}`);
        } else {
          log.info('Schema', `Adding missing column: ${tableDef.name}.${col.name}`);
          await this.addColumn(tableDef.name, col.name, def);
        }
      }
    }

    // 2. 删除多余的列（在 Schema 定义中不存在的列）
    for (const existingCol of existingCols) {
      const normalizedName = existingCol.name.replace(/["'`]/g, '');
      if (!targetNames.has(normalizedName)) {
        if (dryRun) {
          log.warn('Schema [DRY RUN]', `Would drop column: ${tableDef.name}.${existingCol.name}`);
        } else {
          log.warn('Schema', `Dropping obsolete column: ${tableDef.name}.${existingCol.name}`);
          await this.dropColumn(tableDef.name, existingCol.name);
        }
      }
    }

    // 3. 检查并修改列类型（如果类型不匹配）
    let needsRebuild = false;
    const rebuildTargets: { name: string; type: string }[] = [];

    for (const col of tableDef.columns) {
      const existingCol = existingCols.find((c: any) => c.name.replace(/["'`]/g, '') === col.name);
      if (existingCol) {
        const expectedType = this.mapTypeToSQL(col.type, this.getDbType(), col.length);
        const actualType = existingCol.type?.toUpperCase();
        
        // Skip type modification for PostgreSQL SERIAL columns (it's a pseudo-type)
        const isPostgresSerial = this.getDbType() === 'postgresql' && expectedType === 'SERIAL';
        
        if (actualType && !isPostgresSerial && !this.isTypeCompatible(actualType, expectedType)) {
          if (this.getDbType() === 'sqlite') {
            needsRebuild = true;
            rebuildTargets.push({ name: col.name, type: expectedType });
          } else {
            if (dryRun) {
              log.warn('Schema [DRY RUN]', `Would modify column type: ${tableDef.name}.${col.name} (${actualType} -> ${expectedType})`);
            } else {
              log.warn('Schema', `Modifying column type: ${tableDef.name}.${col.name} (${actualType} -> ${expectedType})`);
              await this.modifyColumnType(tableDef.name, col.name, expectedType);
            }
          }
        }
      }
    }

    // SQLite 特殊处理：如果有删除或类型变更，执行表重建
    if (this.getDbType() === 'sqlite' && (needsRebuild || Array.from(targetNames).length !== Array.from(existingNames).length)) {
      await this.rebuildTableForSQLite(tableDef, dryRun);
    }
  }

  /**
   * SQLite 表重建逻辑：支持删除列和修改类型
   */
  private async rebuildTableForSQLite(tableDef: TableDef, dryRun: boolean): Promise<void> {
    const tableName = tableDef.name;
    const tempName = `${tableName}_dsm_rebuild_${Date.now()}`;
    
    // 1. 获取现有列以保留数据
    const existingCols = await this.getTableColumns(tableName);
    const existingColNames = new Set(existingCols.map((c: any) => c.name.replace(/["'`]/g, '')));
    
    // 2. 确定要保留的列（目标列中存在于现有表中的）
    const keepCols = tableDef.columns.filter(c => {
      const normalizedName = c.name.replace(/["'`]/g, '');
      return existingColNames.has(normalizedName);
    });
    const keepColNames = keepCols.map(c => this.escapeIdentifier(c.name));
    
    if (keepColNames.length === 0) {
      log.error('Schema', `No columns to keep during rebuild for ${tableName}. Aborting.`);
      return;
    }

    // 3. 生成新表的 DDL
    const newColDefs = keepCols.map(c => this.getColumnDefinitionSQL(c)).join(', ');
    
    // 处理外键约束
    let fkClause = '';
    if (tableDef.foreignKeys && tableDef.foreignKeys.length > 0) {
      const fks = tableDef.foreignKeys
        .filter(fk => keepColNames.includes(this.escapeIdentifier(fk.column)))
        .map(fk => `FOREIGN KEY (${fk.column}) REFERENCES ${fk.refTable}(${fk.refColumn}) ON DELETE ${fk.onDelete || 'NO ACTION'}`)
        .join(', ');
      if (fks) fkClause = `, ${fks}`;
    }

    if (dryRun) {
      log.info('Schema [DRY RUN]', `Would rebuild SQLite table: ${tableName}`);
      return;
    }

    // 4. 执行重建（事务保护）
    try {
      await this.conn.execute('BEGIN TRANSACTION');
      
      // 创建新表
      await this.conn.execute(`CREATE TABLE ${this.escapeIdentifier(tempName)} (${newColDefs}${fkClause})`);
      
      // 迁移数据
      await this.conn.execute(
        `INSERT INTO ${this.escapeIdentifier(tempName)} (${keepColNames.join(', ')}) 
         SELECT ${keepColNames.join(', ')} FROM ${this.escapeIdentifier(tableName)}`
      );
      
      // 删除旧表并重命名
      await this.conn.execute(`DROP TABLE ${this.escapeIdentifier(tableName)}`);
      await this.conn.execute(`ALTER TABLE ${this.escapeIdentifier(tempName)} RENAME TO ${this.escapeIdentifier(tableName)}`);
      
      // 5. 重建索引
      if (tableDef.indexes) {
        for (const idx of tableDef.indexes) {
          const cols = idx.columns.map(c => this.escapeIdentifier(c)).join(', ');
          const unique = idx.unique ? 'UNIQUE ' : '';
          await this.conn.execute(`CREATE ${unique}INDEX IF NOT EXISTS ${idx.name} ON ${this.escapeIdentifier(tableName)}(${cols})`);
        }
      }

      await this.conn.execute('COMMIT');
      log.info('Schema', `Successfully rebuilt SQLite table: ${tableName}`);
    } catch (err) {
      await this.conn.execute('ROLLBACK');
      log.error('Schema', `Failed to rebuild SQLite table ${tableName}:`, err);
      throw err;
    }
  }

  // --- SQL 生成辅助方法 (根据当前数据库类型动态重写) ---

  private generateCreateTableSQL(table: TableDef): string {
    const dbType = this.getDbType();
    const cols = table.columns.map(c => this.getColumnDefinitionSQL(c)).join(', ');
    
    let sql = `CREATE TABLE IF NOT EXISTS ${this.escapeIdentifier(table.name)} (${cols}`;
    
    // 处理外键约束
    if (table.foreignKeys && table.foreignKeys.length > 0) {
      const fkClauses = table.foreignKeys.map(fk => {
        return `FOREIGN KEY (${fk.column}) REFERENCES ${fk.refTable}(${fk.refColumn}) ON DELETE ${fk.onDelete || 'NO ACTION'}`;
      }).join(', ');
      sql += `, ${fkClauses}`;
    }

    sql += ')';

    // MySQL 特有后缀
    if (dbType === 'mysql') {
      sql += ` ENGINE=${table.engine || 'InnoDB'} DEFAULT CHARSET=${table.charset || 'utf8mb4'}`;
    }

    return sql;
  }

  private getColumnDefinitionSQL(col: ColumnDef): string {
    const dbType = this.getDbType();
    let sqlType = this.mapTypeToSQL(col.type, dbType, col.length);

    let def = `${this.escapeIdentifier(col.name)} ${sqlType}`;

    if (col.primaryKey) {
      def += ' PRIMARY KEY';
      if (col.autoIncrement) {
        if (dbType === 'sqlite') def += ' AUTOINCREMENT';
        else if (dbType === 'mysql') def += ' AUTO_INCREMENT';
        else if (dbType === 'postgresql') def = def.replace('INTEGER', 'SERIAL'); 
      }
    } else {
      if (!col.nullable) def += ' NOT NULL';
    }

    if (col.defaultValue !== undefined) {
      def += ` DEFAULT ${this.formatDefaultValue(col.defaultValue, col.type, dbType)}`;
    }

    if (col.unique) {
      def += ' UNIQUE';
    }

    return def;
  }

  private mapTypeToSQL(type: string, dbType: string, length?: number): string {
    switch (type) {
      case 'id': return dbType === 'postgresql' ? 'SERIAL' : 'INTEGER';
      case 'number': return dbType === 'postgresql' ? 'BIGINT' : 'BIGINT';
      case 'boolean': return dbType === 'postgresql' ? 'BOOLEAN' : (dbType === 'mysql' ? 'TINYINT(1)' : 'INTEGER');
      case 'datetime': return dbType === 'postgresql' ? 'TIMESTAMPTZ' : 'DATETIME';
      case 'json': return dbType === 'postgresql' ? 'JSONB' : (dbType === 'mysql' ? 'JSON' : 'TEXT');
      case 'string': return length ? `VARCHAR(${length})` : (dbType === 'postgresql' ? 'TEXT' : 'TEXT');
      default: return 'TEXT';
    }
  }

  private formatDefaultValue(value: any, type: string, dbType: string): string {
    if (value === null) return 'NULL';
    if (type === 'number') return value.toString();
    
    if (type === 'boolean') {
      if (dbType === 'postgresql') return value ? 'TRUE' : 'FALSE';
      if (dbType === 'mysql') return value ? '1' : '0';
      return value ? '1' : '0'; // SQLite
    }
    
    if (value === 'NOW()' || value === 'CURRENT_TIMESTAMP') {
      return dbType === 'postgresql' ? 'CURRENT_TIMESTAMP' : 'CURRENT_TIMESTAMP';
    }

    if (type === 'json') {
      // JSON 类型通常需要字符串化并转义
      return `'${JSON.stringify(value).replace(/'/g, "''")}'`; 
    }
    
    // 字符串类型：处理单引号转义
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  // ==================== 触发器、视图、存储过程管理 ====================

  /**
   * 同步触发器
   */
  private async syncTrigger(trigger: TriggerDef, dryRun: boolean): Promise<void> {
    const dbType = this.getDbType();
    const exists = await this.triggerExists(trigger.name);
    
    let sql = '';
    if (dbType === 'mysql') {
      sql = `CREATE OR REPLACE TRIGGER ${trigger.name} ${trigger.timing} ${trigger.event} ON ${trigger.table} FOR EACH ROW ${trigger.body}`;
    } else if (dbType === 'postgresql') {
      // PostgreSQL 需要先创建函数，再创建触发器
      const funcName = `${trigger.name}_func`;
      sql = `
        CREATE OR REPLACE FUNCTION ${funcName}() RETURNS TRIGGER AS $$
        BEGIN
          ${trigger.body}
        END;
        $$ LANGUAGE plpgsql;
        
        DROP TRIGGER IF EXISTS ${trigger.name} ON ${trigger.table};
        CREATE TRIGGER ${trigger.name} ${trigger.timing} ${trigger.event} ON ${trigger.table} FOR EACH ROW EXECUTE FUNCTION ${funcName}();
      `;
    } else if (dbType === 'sqlite') {
      sql = `CREATE TRIGGER IF NOT EXISTS ${trigger.name} ${trigger.timing} ${trigger.event} ON ${trigger.table} BEGIN ${trigger.body} END`;
    }

    if (dryRun) {
      log.info('Schema [DRY RUN]', `Would sync trigger: ${trigger.name}`);
    } else {
      if (!exists) {
        log.info('Schema', `Creating trigger: ${trigger.name}`);
      } else {
        log.info('Schema', `Updating trigger: ${trigger.name}`);
      }
      await this.execute(sql);
    }
  }

  private async triggerExists(triggerName: string): Promise<boolean> {
    const dbType = this.getDbType();
    if (dbType === 'sqlite') {
      const res = await this.conn.get(`SELECT name FROM sqlite_master WHERE type='trigger' AND name=?`, [triggerName]);
      return !!res;
    } else if (dbType === 'mysql') {
      const res = await this.conn.get("SELECT TRIGGER_NAME as name FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?", [triggerName]);
      return !!res;
    } else if (dbType === 'postgresql') {
      const res = await this.conn.get("SELECT tgname as name FROM pg_trigger WHERE tgname = $1", [triggerName]);
      return !!res;
    }
    return false;
  }

  /**
   * 同步视图
   */
  private async syncView(view: ViewDef, dryRun: boolean): Promise<void> {
    const sql = `CREATE OR REPLACE VIEW ${this.escapeIdentifier(view.name)} AS ${view.query}`;
    
    if (dryRun) {
      log.info('Schema [DRY RUN]', `Would sync view: ${view.name}`);
    } else {
      log.info('Schema', `Syncing view: ${view.name}`);
      await this.execute(sql);
    }
  }

  /**
   * 同步存储过程
   */
  private async syncProcedure(proc: ProcedureDef, dryRun: boolean): Promise<void> {
    const dbType = this.getDbType();
    const params = proc.parameters || '';
    
    let sql = '';
    if (dbType === 'mysql') {
      sql = `CREATE OR REPLACE PROCEDURE ${proc.name}${params} ${proc.body}`;
    } else if (dbType === 'postgresql') {
      sql = `CREATE OR REPLACE FUNCTION ${proc.name}${params} ${proc.body}`;
    } else if (dbType === 'sqlite') {
      // SQLite 不支持存储过程，跳过
      log.warn('Schema', `SQLite does not support stored procedures. Skipping: ${proc.name}`);
      return;
    }

    if (dryRun) {
      log.info('Schema [DRY RUN]', `Would sync procedure: ${proc.name}`);
    } else {
      log.info('Schema', `Syncing procedure: ${proc.name}`);
      await this.execute(sql);
    }
  }
}
