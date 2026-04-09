/**
 * 迁移系统
 * 管理数据库版本迁移和回滚
 */

import type { DatabaseConnection, Transaction } from '../core/types';
import { log } from '../../lib/logger';

/** 迁移接口 */
export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly description?: string;

  up(db: DatabaseConnection): Promise<void>;
  down?(db: DatabaseConnection): Promise<void>;
}

/** 迁移记录 */
export interface MigrationRecord {
  version: number;
  name: string;
  appliedAt: Date;
}

/** 迁移状态 */
export interface MigrationStatus {
  currentVersion: number;
  pendingCount: number;
  appliedCount: number;
  totalCount: number;
}

/** 迁移管理器 */
export class MigrationManager {
  private connection: DatabaseConnection;
  private migrations: Migration[] = [];
  private readonly tableName = 'migrations';

  constructor(connection: DatabaseConnection) {
    this.connection = connection;
  }

  register(migration: Migration): void {
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.version - b.version);
  }

  registerMany(migrations: Migration[]): void {
    migrations.forEach(m => this.register(m));
  }

  async initialize(): Promise<void> {
    const type = this.connection.type;

    if (type === 'sqlite') {
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        )
      `);
    } else if (type === 'mysql') {
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          version INT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          applied_at DATETIME NOT NULL
        )
      `);
    } else if (type === 'postgresql') {
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          version INTEGER PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          applied_at TIMESTAMP NOT NULL
        )
      `);
    }
  }

  async getCurrentVersion(): Promise<number> {
    try {
      const result = await this.connection.get<{ version: number }>(`
        SELECT version FROM ${this.tableName} ORDER BY version DESC LIMIT 1
      `);
      return result?.version || 0;
    } catch {
      return 0;
    }
  }

  async getAppliedMigrations(): Promise<MigrationRecord[]> {
    try {
      const results = await this.connection.query<{ version: number; name: string; applied_at: string }>(`
        SELECT version, name, applied_at FROM ${this.tableName} ORDER BY version ASC
      `);

      return results.map(r => ({
        version: r.version,
        name: r.name,
        appliedAt: new Date(r.applied_at),
      }));
    } catch {
      return [];
    }
  }

  async getPendingMigrations(): Promise<Migration[]> {
    const currentVersion = await this.getCurrentVersion();
    return this.migrations.filter(m => m.version > currentVersion);
  }

  async migrate(targetVersion?: number): Promise<void> {
    await this.initialize();

    const pending = await this.getPendingMigrations();
    if (pending.length === 0) {
      log.info('Migration', 'No pending migrations');
      return;
    }

    const migrationsToRun = targetVersion
      ? pending.filter(m => m.version <= targetVersion)
      : pending;

    log.info('Migration', `Running ${migrationsToRun.length} migration(s)...`);

    for (const migration of migrationsToRun) {
      log.info('Migration', `Applying: ${migration.version} - ${migration.name}`);

      await this.connection.execute('BEGIN TRANSACTION');
      try {
        await migration.up(this.connection);

        const now = new Date().toISOString();
        await this.connection.execute(
          `INSERT INTO ${this.tableName} (version, name, applied_at) VALUES (?, ?, ?)`,
          [migration.version, migration.name, now]
        );

        await this.connection.execute('COMMIT');
        log.info('Migration', `Applied: ${migration.version} - ${migration.name}`);
      } catch (error) {
        await this.connection.execute('ROLLBACK');
        log.error('Migration', `Failed: ${migration.version} - ${migration.name}`, { error });
        throw error;
      }
    }

    log.info('Migration', 'Migration completed');
  }

  async rollback(steps: number = 1): Promise<void> {
    await this.initialize();

    const applied = await this.getAppliedMigrations();
    if (applied.length === 0) {
      log.info('Migration', 'No migrations to rollback');
      return;
    }

    const toRollback = applied.slice(-steps);
    log.info('Migration', `Rolling back ${toRollback.length} migration(s)...`);

    for (const record of toRollback.reverse()) {
      const migration = this.migrations.find(m => m.version === record.version);
      if (!migration) {
        log.warn('Migration', `Migration ${record.version} not found, skipping`);
        continue;
      }

      if (!migration.down) {
        log.warn('Migration', `Migration ${record.version} has no down method, skipping`);
        continue;
      }

      log.info('Migration', `Rolling back: ${migration.version} - ${migration.name}`);

      await this.connection.execute('BEGIN TRANSACTION');
      try {
        await migration.down(this.connection);
        await this.connection.execute(
          `DELETE FROM ${this.tableName} WHERE version = ?`,
          [migration.version]
        );
        await this.connection.execute('COMMIT');
        log.info('Migration', `Rolled back: ${migration.version} - ${migration.name}`);
      } catch (error) {
        await this.connection.execute('ROLLBACK');
        log.error('Migration', `Rollback failed: ${migration.version} - ${migration.name}`, { error });
        throw error;
      }
    }

    log.info('Migration', 'Rollback completed');
  }

  async reset(): Promise<void> {
    await this.initialize();

    const applied = await this.getAppliedMigrations();
    await this.rollback(applied.length);
  }

  async refresh(): Promise<void> {
    await this.reset();
    await this.migrate();
  }

  async status(): Promise<MigrationStatus> {
    const currentVersion = await this.getCurrentVersion();
    const pending = await this.getPendingMigrations();

    return {
      currentVersion,
      pendingCount: pending.length,
      appliedCount: this.migrations.length - pending.length,
      totalCount: this.migrations.length,
    };
  }
}

/** 创建迁移函数 */
export function createMigration(
  version: number,
  name: string,
  upFn: (db: DatabaseConnection) => Promise<void>,
  downFn?: (db: DatabaseConnection) => Promise<void>,
  description?: string
): Migration {
  return {
    version,
    name,
    description,
    up: upFn,
    down: downFn,
  };
}
