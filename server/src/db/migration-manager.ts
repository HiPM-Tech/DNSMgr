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

  constructor(conn: any, schema: SchemaDefinition) {
    this.conn = conn;
    this.schemaHash = calculateSchemaHash(schema);
  }

  /**
   * Get current schema hash (version)
   */
  getCurrentVersion(): string {
    return this.schemaHash;
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
    const sql = `INSERT INTO schema_versions (version, description, success, execution_time_ms) 
                 VALUES (?, ?, 1, ?)`;
    
    await this.conn.execute(sql, [this.schemaHash, description, executionTimeMs]);
    log.info('SchemaVersion', `Schema version ${this.schemaHash} recorded as successful`);
  }

  /**
   * Record failed migration
   */
  async recordFailure(
    description: string,
    errorMessage: string,
    executionTimeMs: number
  ): Promise<void> {
    const sql = `INSERT INTO schema_versions (version, description, success, error_message, execution_time_ms) 
                 VALUES (?, ?, 0, ?, ?)`;
    
    await this.conn.execute(sql, [this.schemaHash, description, errorMessage, executionTimeMs]);
    log.error('SchemaVersion', `Schema version ${this.schemaHash} recorded as failed: ${errorMessage}`);
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
