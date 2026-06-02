import { log } from '../../lib/logger';
import { calculateSchemaHash, SchemaDefinition } from './schemas';

export interface SchemaVersion {
  major: number;
  minor: number;
  patch: number;
  hash: string;
  description?: string;
}

export interface MigrationRecord {
  version: string;
  semanticVersion?: string;
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
  private semanticVersion: SchemaVersion;

  constructor(conn: any, schema: SchemaDefinition, version?: Partial<SchemaVersion>) {
    this.conn = conn;
    this.schema = schema;
    this.schemaHash = calculateSchemaHash(schema);
    
    this.semanticVersion = {
      major: version?.major ?? 1,
      minor: version?.minor ?? 5,
      patch: version?.patch ?? 0,
      hash: this.schemaHash,
      description: version?.description,
    };
  }

  getCurrentVersion(): string {
    return this.schemaHash;
  }

  getSemanticVersion(): string {
    return `${this.semanticVersion.major}.${this.semanticVersion.minor}.${this.semanticVersion.patch}`;
  }

  getVersionInfo(): SchemaVersion {
    return { ...this.semanticVersion };
  }

  async hasVersionTable(): Promise<boolean> {
    try {
      await this.conn.execute('SELECT 1 FROM schema_versions LIMIT 1');
      return true;
    } catch (error) {
      return false;
    }
  }

  async ensureVersionTableExists(): Promise<void> {
    const dbType = (this.conn as any).type || 'unknown';
    
    if (await this.hasVersionTable()) {
      return;
    }
    
    log.info('SchemaVersion', 'Creating schema_versions table...');
    
    let createTableSQL = '';
    
    switch (dbType) {
      case 'mysql':
        createTableSQL = `
          CREATE TABLE IF NOT EXISTS schema_versions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            version VARCHAR(50) NOT NULL UNIQUE,
            semantic_version VARCHAR(20),
            description TEXT,
            applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN NOT NULL DEFAULT TRUE,
            error_message TEXT,
            execution_time_ms INT,
            system_type VARCHAR(50) DEFAULT 'hidns',
            INDEX idx_version (version),
            INDEX idx_semantic_version (semantic_version),
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
            semantic_version VARCHAR(20),
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
            semantic_version TEXT,
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

  async autoDetectAndPromote(description: string): Promise<boolean> {
    const dbType = (this.conn as any).type || 'unknown';
    log.info('SchemaVersion', `Auto-detecting migration status for ${dbType}...`);

    try {
      const isMigrated = await this.checkMigrationIndicators(dbType);
      
      if (isMigrated) {
        log.info('SchemaVersion', 'Database appears to be already migrated, promoting status...');
        
        await this.ensureVersionTableExists();
        
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

  private async checkMySQLIndicators(): Promise<boolean> {
    try {
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

  private async checkPostgreSQLIndicators(): Promise<boolean> {
    try {
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

  private async checkSQLiteIndicators(): Promise<boolean> {
    try {
      const checkSql = `PRAGMA table_info(dns_accounts)`;
      const result = await this.conn.execute(checkSql);
      
      if (Array.isArray(result)) {
        const hasEnabledColumn = result.some((row: any) => row.name.replace(/["'`]/g, '') === 'enabled');
        return hasEnabledColumn;
      }
      
      return false;
    } catch (error) {
      log.warn('SchemaVersion', 'Failed to check SQLite indicators', { error: (error as Error).message });
      return false;
    }
  }

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
      if ((error as Error).message?.includes('schema_versions')) {
        return false;
      }
      throw error;
    }
  }

  async recordSuccess(
    description: string,
    executionTimeMs: number
  ): Promise<void> {
    const checkSql = 'SELECT COUNT(*) as cnt FROM schema_versions WHERE version = ?';
    const result = await this.conn.get(checkSql, [this.schemaHash]) as { cnt: number } | undefined;
    
    if (result && result.cnt > 0) {
      log.debug('SchemaVersion', `Schema version ${this.schemaHash} already recorded, skipping`);
      return;
    }
    
    const sql = `INSERT INTO schema_versions (version, semantic_version, description, success, execution_time_ms, system_type) 
                 VALUES (?, ?, ?, 1, ?, 'hidns')`;
    
    await this.conn.execute(sql, [
      this.schemaHash, 
      this.getSemanticVersion(),
      description, 
      executionTimeMs
    ]);
    log.info('SchemaVersion', `Schema version ${this.getSemanticVersion()} (${this.schemaHash}) recorded as successful (HiDNS)`);
  }

  async recordFailure(
    description: string,
    errorMessage: string,
    executionTimeMs: number
  ): Promise<void> {
    const checkSql = 'SELECT COUNT(*) as cnt FROM schema_versions WHERE version = ?';
    const result = await this.conn.get(checkSql, [this.schemaHash]) as { cnt: number } | undefined;
    
    if (result && result.cnt > 0) {
      log.debug('SchemaVersion', `Schema version ${this.schemaHash} already recorded, skipping failure record`);
      return;
    }
    
    const sql = `INSERT INTO schema_versions (version, semantic_version, description, success, error_message, execution_time_ms, system_type) 
                 VALUES (?, ?, ?, 0, ?, ?, 'hidns')`;
    
    await this.conn.execute(sql, [
      this.schemaHash,
      this.getSemanticVersion(),
      description, 
      errorMessage, 
      executionTimeMs
    ]);
    log.error('SchemaVersion', `Schema version ${this.getSemanticVersion()} (${this.schemaHash}) recorded as failed (HiDNS): ${errorMessage}`);
  }

  async getAppliedMigrations(): Promise<MigrationRecord[]> {
    const sql = 'SELECT * FROM schema_versions ORDER BY applied_at ASC';
    const result = await this.conn.execute(sql);
    
    if (!Array.isArray(result)) {
      return [];
    }

    return result.map((row: any) => ({
      version: row.version,
      semanticVersion: row.semantic_version,
      description: row.description,
      appliedAt: new Date(row.applied_at),
      success: row.success === 1 || row.success === true,
      errorMessage: row.error_message,
      executionTimeMs: row.execution_time_ms,
    }));
  }

  async getLastSuccessfulVersion(): Promise<string | null> {
    const sql = 'SELECT version FROM schema_versions WHERE success = 1 ORDER BY applied_at DESC LIMIT 1';
    const result = await this.conn.execute(sql);
    
    if (Array.isArray(result) && result.length > 0) {
      return (result[0] as any).version;
    }
    
    return null;
  }

  async recordDSMVersion(schemaVersion: string): Promise<void> {
    const exists = await this.isDSMVersionRecorded(schemaVersion);
    if (exists) {
      log.debug('SchemaVersion', `DSM version ${schemaVersion} already recorded.`);
      return;
    }

    await this.recordSuccess(
      `Declarative Schema Management v${schemaVersion}`,
      0
    );
    
    await this.conn.execute(
      `UPDATE schema_versions SET semantic_version = ? WHERE version = ?`,
      [schemaVersion, this.schemaHash]
    );
  }

  async isDSMVersionRecorded(schemaVersion: string): Promise<boolean> {
    const result = await this.conn.get(
      `SELECT COUNT(*) as cnt FROM schema_versions 
       WHERE semantic_version = ? AND version LIKE 'DSM-%'`,
      [schemaVersion]
    );
    return (result as any)?.cnt > 0;
  }
}