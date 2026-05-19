/**
 * Schema Version Manager
 * 数据库迁移版本管理工具
 */

import { log } from '../lib/logger';
import { calculateSchemaHash, SchemaDefinition } from './schemas';

export interface MigrationRecord {
  version: string;  // Schema hash
  description?: string;
  appliedAt: Date;
  success: boolean;
  errorMessage?: string;
  executionTimeMs?: number;
}

export class SchemaVersionManager {
  private conn: any;
  private schemaHash: string;
  private schema: SchemaDefinition;

  constructor(conn: any, schema: SchemaDefinition) {
    this.conn = conn;
    this.schema = schema;
    this.schemaHash = calculateSchemaHash(schema);
  }

  /**
   * Get current schema hash (version)
   */
  getCurrentVersion(): string {
    return this.schemaHash;
  }

  /**
   * Check if schema_versions table exists
   */
  async hasVersionTable(): Promise<boolean> {
    try {
      await this.conn.execute('SELECT 1 FROM schema_versions LIMIT 1');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Ensure schema_versions table exists, create it if not
   */
  async ensureVersionTableExists(): Promise<void> {
    const dbType = (this.conn as any).type || 'unknown';
    
    // Check if table already exists
    if (await this.hasVersionTable()) {
      return; // Table already exists
    }
    
    log.info('SchemaVersion', 'Creating schema_versions table...');
    
    // Create table based on database type
    let createTableSQL = '';
    
    switch (dbType) {
      case 'mysql':
        createTableSQL = `
          CREATE TABLE IF NOT EXISTS schema_versions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            version VARCHAR(50) NOT NULL UNIQUE,
            description TEXT,
            applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN NOT NULL DEFAULT TRUE,
            error_message TEXT,
            execution_time_ms INT,
            system_type VARCHAR(50) DEFAULT 'hidns',
            INDEX idx_version (version),
            INDEX idx_applied_at (applied_at),
            INDEX idx_system_type (system_type)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `;
        break;
      
      case 'postgresql':
        createTableSQL = `
          CREATE TABLE IF NOT EXISTS schema_versions (
            id SERIAL PRIMARY KEY,
            version VARCHAR(50) NOT NULL UNIQUE,
            description TEXT,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN NOT NULL DEFAULT TRUE,
            error_message TEXT,
            execution_time_ms INTEGER,
            system_type VARCHAR(50) DEFAULT 'hidns'
          )
        `;
        break;
      
      case 'sqlite':
      default:
        createTableSQL = `
          CREATE TABLE IF NOT EXISTS schema_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version TEXT NOT NULL UNIQUE,
            description TEXT,
            applied_at TEXT NOT NULL DEFAULT (datetime('now')),
            success INTEGER NOT NULL DEFAULT 1,
            error_message TEXT,
            execution_time_ms INTEGER,
            system_type TEXT DEFAULT 'hidns'
          )
        `;
        break;
    }
    
    await this.conn.execute(createTableSQL);
    log.info('SchemaVersion', 'schema_versions table created successfully');
  }

  /**
   * Auto-detect and promote migration status based on actual database state
   * Used when schema_versions table doesn't exist (first-time setup or legacy upgrade)
   */
  async autoDetectAndPromote(description: string): Promise<boolean> {
    const dbType = (this.conn as any).type || 'unknown';
    log.info('SchemaVersion', `Auto-detecting migration status for ${dbType}...`);

    try {
      // Check key indicators to determine if migration is already applied
      const isMigrated = await this.checkMigrationIndicators(dbType);
      
      if (isMigrated) {
        log.info('SchemaVersion', 'Database appears to be already migrated, promoting status...');
        
        // Create schema_versions table if it doesn't exist
        await this.ensureVersionTableExists();
        
        // Create version record to mark as completed
        await this.recordSuccess(description, 0);
        log.info('SchemaVersion', `Auto-promoted schema version ${this.schemaHash} as successful`);
        return true;
      } else {
        log.info('SchemaVersion', 'Database needs migration');
        return false;
      }
    } catch (error) {
      log.error('SchemaVersion', 'Failed to auto-detect migration status', { error: (error as Error).message });
      return false;
    }
  }

  /**
   * Check migration indicators based on database type
   */
  private async checkMigrationIndicators(dbType: string): Promise<boolean> {
    switch (dbType) {
      case 'mysql':
        return await this.checkMySQLIndicators();
      case 'postgresql':
        return await this.checkPostgreSQLIndicators();
      case 'sqlite':
        return await this.checkSQLiteIndicators();
      default:
        return false;
    }
  }

  /**
   * Check MySQL migration indicators
   */
  private async checkMySQLIndicators(): Promise<boolean> {
    try {
      // Check if dns_accounts.enabled column exists
      const checkSql = `
        SELECT COUNT(*) as count 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'dns_accounts' AND COLUMN_NAME = 'enabled'
      `;
      const result = await this.conn.execute(checkSql);
      
      if (Array.isArray(result) && result.length > 0) {
        const count = (result[0] as any).count || (result[0] as any)['COUNT(*)'];
        return parseInt(String(count), 10) > 0;
      }
      
      return false;
    } catch (error) {
      log.warn('SchemaVersion', 'Failed to check MySQL indicators', { error: (error as Error).message });
      return false;
    }
  }

  /**
   * Check PostgreSQL migration indicators
   */
  private async checkPostgreSQLIndicators(): Promise<boolean> {
    try {
      // Check if dns_accounts.enabled column exists
      const checkSql = `
        SELECT COUNT(*) as count 
        FROM information_schema.columns 
        WHERE table_name = 'dns_accounts' AND column_name = 'enabled'
      `;
      const result = await this.conn.execute(checkSql);
      
      if (Array.isArray(result) && result.length > 0) {
        const count = (result[0] as any).count || (result[0] as any)['COUNT(*)'];
        return parseInt(String(count), 10) > 0;
      }
      
      return false;
    } catch (error) {
      log.warn('SchemaVersion', 'Failed to check PostgreSQL indicators', { error: (error as Error).message });
      return false;
    }
  }

  /**
   * Check SQLite migration indicators
   */
  private async checkSQLiteIndicators(): Promise<boolean> {
    try {
      // Check if dns_accounts.enabled column exists
      const checkSql = `PRAGMA table_info(dns_accounts)`;
      const result = await this.conn.execute(checkSql);
      
      if (Array.isArray(result)) {
        const hasEnabledColumn = result.some((row: any) => row.name === 'enabled');
        return hasEnabledColumn;
      }
      
      return false;
    } catch (error) {
      log.warn('SchemaVersion', 'Failed to check SQLite indicators', { error: (error as Error).message });
      return false;
    }
  }

  /**
   * Check if current schema version is already applied
   */
  async isCurrentVersionApplied(): Promise<boolean> {
    try {
      const sql = 'SELECT COUNT(*) as count FROM schema_versions WHERE version = ? AND success = 1';
      const result = await this.conn.execute(sql, [this.schemaHash]);
      
      if (Array.isArray(result) && result.length > 0) {
        const count = (result[0] as any).count || (result[0] as any)['COUNT(*)'];
        return count > 0;
      }
      
      return false;
    } catch (error) {
      // If table doesn't exist, return false
      if ((error as Error).message?.includes('schema_versions')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Record successful migration
   */
  async recordSuccess(
    description: string,
    executionTimeMs: number
  ): Promise<void> {
    const sql = `INSERT INTO schema_versions (version, description, success, execution_time_ms, system_type) 
                 VALUES (?, ?, 1, ?, 'hidns')`;
    
    await this.conn.execute(sql, [this.schemaHash, description, executionTimeMs]);
    log.info('SchemaVersion', `Schema version ${this.schemaHash} recorded as successful (HiDNS)`);
  }

  /**
   * Record failed migration
   */
  async recordFailure(
    description: string,
    errorMessage: string,
    executionTimeMs: number
  ): Promise<void> {
    const sql = `INSERT INTO schema_versions (version, description, success, error_message, execution_time_ms, system_type) 
                 VALUES (?, ?, 0, ?, ?, 'hidns')`;
    
    await this.conn.execute(sql, [this.schemaHash, description, errorMessage, executionTimeMs]);
    log.error('SchemaVersion', `Schema version ${this.schemaHash} recorded as failed (HiDNS): ${errorMessage}`);
  }

  /**
   * 获取所有已应用的迁移
   */
  async getAppliedMigrations(): Promise<MigrationRecord[]> {
    const sql = 'SELECT * FROM schema_versions ORDER BY applied_at ASC';
    const result = await this.conn.execute(sql);
    
    if (!Array.isArray(result)) {
      return [];
    }

    return result.map((row: any) => ({
      version: row.version,
      description: row.description,
      appliedAt: new Date(row.applied_at),
      success: row.success === 1 || row.success === true,
      errorMessage: row.error_message,
      executionTimeMs: row.execution_time_ms,
    }));
  }

  /**
   * 获取最后一个成功的版本
   */
  async getLastSuccessfulVersion(): Promise<string | null> {
    const sql = 'SELECT version FROM schema_versions WHERE success = 1 ORDER BY applied_at DESC LIMIT 1';
    const result = await this.conn.execute(sql);
    
    if (Array.isArray(result) && result.length > 0) {
      return (result[0] as any).version;
    }
    
    return null;
  }
}
