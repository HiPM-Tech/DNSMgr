/**
 * Schema Version Manager
 * 数据库迁移版本管理工具
 */

import { log } from '../lib/logger';

export interface MigrationRecord {
  version: string;
  description?: string;
  appliedAt: Date;
  success: boolean;
  errorMessage?: string;
  executionTimeMs?: number;
}

export class SchemaVersionManager {
  private conn: any;
  private dbType: string;

  constructor(conn: any, dbType: string) {
    this.conn = conn;
    this.dbType = dbType;
  }

  /**
   * 检查版本是否已应用
   */
  async isVersionApplied(version: string): Promise<boolean> {
    try {
      const sql = 'SELECT COUNT(*) as count FROM schema_versions WHERE version = ? AND success = 1';
      const result = await this.conn.execute(sql, [version]);
      
      if (Array.isArray(result) && result.length > 0) {
        const count = (result[0] as any).count || (result[0] as any)['COUNT(*)'];
        return count > 0;
      }
      
      return false;
    } catch (error) {
      // 如果表不存在，返回 false
      if ((error as Error).message?.includes('schema_versions')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * 记录迁移成功
   */
  async recordSuccess(
    version: string,
    description: string,
    executionTimeMs: number
  ): Promise<void> {
    const sql = `INSERT INTO schema_versions (version, description, success, execution_time_ms) 
                 VALUES (?, ?, 1, ?)`;
    
    await this.conn.execute(sql, [version, description, executionTimeMs]);
    log.info('SchemaVersion', `Migration ${version} recorded as successful`);
  }

  /**
   * 记录迁移失败
   */
  async recordFailure(
    version: string,
    description: string,
    errorMessage: string,
    executionTimeMs: number
  ): Promise<void> {
    const sql = `INSERT INTO schema_versions (version, description, success, error_message, execution_time_ms) 
                 VALUES (?, ?, 0, ?, ?)`;
    
    await this.conn.execute(sql, [version, description, errorMessage, executionTimeMs]);
    log.error('SchemaVersion', `Migration ${version} recorded as failed: ${errorMessage}`);
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
