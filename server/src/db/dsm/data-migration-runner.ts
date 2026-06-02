import { getConnection } from '../dal/connection';
import { log } from '../../lib/logger';
import { SchemaVersionManager } from './migration-manager';
import { sqliteSchema } from './schemas/dialects/sqlite';

export interface DataMigration {
  id: string;
  description: string;
  dependsOn?: string[];
  condition: () => Promise<boolean>;
  execute: () => Promise<void>;
}

export interface MigrationResult {
  executed: string[];
  skipped: string[];
  failed: { id: string; error: Error }[];
}

export class DataMigrationRunner {
  private migrations: Map<string, DataMigration> = new Map();
  private versionManager: SchemaVersionManager;

  constructor() {
    const conn = getConnection();
    this.versionManager = new SchemaVersionManager(conn, sqliteSchema);
  }

  register(migration: DataMigration): void {
    if (this.migrations.has(migration.id)) {
      throw new Error(`Migration ${migration.id} is already registered.`);
    }
    this.migrations.set(migration.id, migration);
  }

  async run(options: { dryRun?: boolean } = {}): Promise<MigrationResult> {
    const result: MigrationResult = { executed: [], skipped: [], failed: [] };
    const conn = getConnection();

    await this.ensureVersionTable();

    const executedIds = await this.getExecutedMigrationIds();
    
    const sortedMigrations = this.topologicalSort();

    for (const migrationId of sortedMigrations) {
      const migration = this.migrations.get(migrationId);
      if (!migration) continue;

      if (executedIds.includes(migrationId)) {
        log.debug('DSM-Migration', `Skipping already executed migration: ${migrationId}`);
        result.skipped.push(migrationId);
        continue;
      }

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

      if (options.dryRun) {
        log.warn('DSM-Migration [DRY RUN]', `🔍 Would execute: ${migrationId} - ${migration.description}`);
        result.executed.push(migrationId);
      } else {
        const startTime = Date.now();
        try {
          log.info('DSM-Migration', `🚀 Starting migration: ${migrationId}`);
          log.debug('DSM-Migration', `Description: ${migration.description}`);
          
          await migration.execute();
          
          const duration = Date.now() - startTime;
          log.info('DSM-Migration', `✨ Completed: ${migrationId} in ${duration}ms`);
          
          await this.recordSuccess(migrationId, migration.description);
          result.executed.push(migrationId);
        } catch (e) {
          log.error('DSM-Migration', `Failed to execute ${migrationId}`, e);
          result.failed.push({ id: migrationId, error: e as Error });
        }
      }
    }

    log.info('DSM-Migration', '--- Migration Summary ---');
    log.info('DSM-Migration', `Executed: ${result.executed.length}, Skipped: ${result.skipped.length}, Failed: ${result.failed.length}`);
    if (result.failed.length > 0) {
      log.error('DSM-Migration', 'Failed migrations:', result.failed.map(f => f.id).join(', '));
    }
    log.info('DSM-Migration', '-----------------------');

    return result;
  }

  private async ensureVersionTable(): Promise<void> {
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
      "SELECT version FROM schema_versions WHERE system_type = 'hidns-migration' AND success = true"
    );
    return rows.map((r: any) => r.version);
  }

  private async recordSuccess(id: string, description: string): Promise<void> {
    const conn = getConnection();
    await conn.execute(
      `INSERT INTO schema_versions (version, semantic_version, description, success, system_type) 
       VALUES (?, ?, ?, true, 'hidns-migration')`,
      [id, '1.0.0', description]
    );
  }

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