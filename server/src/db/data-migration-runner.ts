import { getConnection } from './connection';
import { log } from '../lib/logger';
import { SchemaVersionManager } from './migration-manager';
import { sqliteSchema } from './schemas/sqlite';

export interface DataMigration {
  id: string;           // 唯一标识，如 'migrate-dns-account-type'
  description: string;  // 人类可读描述
  dependsOn?: string[]; // 依赖的其他 migration ID
  condition: () => Promise<boolean>; // 执行条件检测
  execute: () => Promise<void>;      // 迁移逻辑
}

export interface MigrationResult {
  executed: string[];   // 已执行的迁移 ID
  skipped: string[];    // 跳过的迁移 ID
  failed: { id: string; error: Error }[];
}

/**
 * 数据迁移执行器
 * 负责在 DSM 结构同步完成后，执行必要的数据转换和初始化
 */
export class DataMigrationRunner {
  private migrations: Map<string, DataMigration> = new Map();
  private versionManager: SchemaVersionManager;

  constructor() {
    const conn = getConnection();
    // 使用 SQLite Schema 作为基础定义来计算 Hash
    this.versionManager = new SchemaVersionManager(conn, sqliteSchema);
  }

  /**
   * 注册一个数据迁移任务
   */
  register(migration: DataMigration): void {
    if (this.migrations.has(migration.id)) {
      throw new Error(`Migration ${migration.id} is already registered.`);
    }
    this.migrations.set(migration.id, migration);
  }

  /**
   * 执行所有待处理的迁移
   */
  async run(options: { dryRun?: boolean } = {}): Promise<MigrationResult> {
    const result: MigrationResult = { executed: [], skipped: [], failed: [] };
    const conn = getConnection();

    // 确保 schema_versions 表存在
    await this.ensureVersionTable();

    // 获取已执行过的迁移 ID
    const executedIds = await this.getExecutedMigrationIds();
    
    // 拓扑排序处理依赖
    const sortedMigrations = this.topologicalSort();

    for (const migrationId of sortedMigrations) {
      const migration = this.migrations.get(migrationId);
      if (!migration) continue;

      // 检查是否已执行
      if (executedIds.includes(migrationId)) {
        log.debug('DSM-Migration', `Skipping already executed migration: ${migrationId}`);
        result.skipped.push(migrationId);
        continue;
      }

      // 检查执行条件
      let shouldExecute = true;
      try {
        log.debug('DSM-Migration', `Checking condition for: ${migrationId}...`);
        shouldExecute = await migration.condition();
        if (shouldExecute) {
          log.info('DSM-Migration', `✅ Condition met for ${migrationId}. Will execute.`);
        } else {
          log.debug('DSM-Migration', `⏭️ Condition not met for ${migrationId}. Skipping.`);
        }
      } catch (e) {
        log.error('DSM-Migration', `Condition check failed for ${migrationId}`, e);
        result.failed.push({ id: migrationId, error: e as Error });
        continue;
      }

      if (!shouldExecute) {
        log.debug('DSM-Migration', `Condition not met, skipping: ${migrationId}`);
        result.skipped.push(migrationId);
        continue;
      }

      // 执行迁移
      if (options.dryRun) {
        log.warn('DSM-Migration [DRY RUN]', `🔍 Would execute: ${migrationId} - ${migration.description}`);
        result.executed.push(migrationId); // 预览模式下也计入
      } else {
        const startTime = Date.now();
        try {
          log.info('DSM-Migration', `🚀 Starting migration: ${migrationId}`);
          log.debug('DSM-Migration', `Description: ${migration.description}`);
          
          await migration.execute();
          
          const duration = Date.now() - startTime;
          log.info('DSM-Migration', `✨ Completed: ${migrationId} in ${duration}ms`);
          
          // 记录成功
          await this.recordSuccess(migrationId, migration.description);
          result.executed.push(migrationId);
        } catch (e) {
          log.error('DSM-Migration', `Failed to execute ${migrationId}`, e);
          result.failed.push({ id: migrationId, error: e as Error });
          // 失败时可以选择中断或继续，这里选择继续但记录错误
        }
      }
    }

    // 输出汇总报告
    log.info('DSM-Migration', '--- Migration Summary ---');
    log.info('DSM-Migration', `Executed: ${result.executed.length}, Skipped: ${result.skipped.length}, Failed: ${result.failed.length}`);
    if (result.failed.length > 0) {
      log.error('DSM-Migration', 'Failed migrations:', result.failed.map(f => f.id).join(', '));
    }
    log.info('DSM-Migration', '-----------------------');

    return result;
  }

  private async ensureVersionTable(): Promise<void> {
    // 简单的表存在性检查与创建，确保能写入迁移记录
    const conn = getConnection();
    const type = conn.type;
    
    if (type === 'sqlite') {
      await conn.execute(`CREATE TABLE IF NOT EXISTS schema_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL UNIQUE,
        semantic_version TEXT,
        description TEXT,
        applied_at TEXT NOT NULL DEFAULT (datetime('now')),
        success INTEGER NOT NULL DEFAULT 1,
        error_message TEXT,
        execution_time_ms INTEGER,
        system_type TEXT DEFAULT 'hidns-dsm'
      )`);
    } else if (type === 'mysql') {
      await conn.execute(`CREATE TABLE IF NOT EXISTS schema_versions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        version VARCHAR(50) NOT NULL UNIQUE,
        semantic_version VARCHAR(20),
        description TEXT,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN NOT NULL DEFAULT TRUE,
        error_message TEXT,
        execution_time_ms INT,
        system_type VARCHAR(50) DEFAULT 'hidns-dsm'
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    } else if (type === 'postgresql') {
      await conn.execute(`CREATE TABLE IF NOT EXISTS schema_versions (
        id SERIAL PRIMARY KEY,
        version VARCHAR(50) NOT NULL UNIQUE,
        semantic_version VARCHAR(20),
        description TEXT,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN NOT NULL DEFAULT TRUE,
        error_message TEXT,
        execution_time_ms INTEGER,
        system_type VARCHAR(50) DEFAULT 'hidns-dsm'
      )`);
    }
  }

  private async getExecutedMigrationIds(): Promise<string[]> {
    const conn = getConnection();
    const rows = await conn.query(
      "SELECT version FROM schema_versions WHERE system_type = 'hidns-migration' AND success = 1"
    );
    return rows.map((r: any) => r.version);
  }

  private async recordSuccess(id: string, description: string): Promise<void> {
    const conn = getConnection();
    await conn.execute(
      `INSERT INTO schema_versions (version, semantic_version, description, success, system_type) 
       VALUES (?, ?, ?, 1, 'hidns-migration')`,
      [id, '1.0.0', description]
    );
  }

  /**
   * 简单的拓扑排序，处理迁移依赖
   */
  private topologicalSort(): string[] {
    const visited = new Set<string>();
    const tempMarked = new Set<string>();
    const result: string[] = [];

    const visit = (id: string) => {
      if (tempMarked.has(id)) throw new Error(`Circular dependency detected at ${id}`);
      if (visited.has(id)) return;

      tempMarked.add(id);
      const migration = this.migrations.get(id);
      if (migration?.dependsOn) {
        for (const dep of migration.dependsOn) {
          visit(dep);
        }
      }
      tempMarked.delete(id);
      visited.add(id);
      result.push(id);
    };

    for (const id of this.migrations.keys()) {
      if (!visited.has(id)) visit(id);
    }

    return result;
  }
}
