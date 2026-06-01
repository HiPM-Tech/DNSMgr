import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { log } from '../lib/logger';

const execAsync = promisify(exec);

export class BackupManager {
  private backupDir: string;
  private isBackupRequired: boolean;

  constructor() {
    this.backupDir = path.join(process.cwd(), 'data', 'backups');
    // 默认开启强制备份，可通过环境变量 DSM_BACKUP_REQUIRED=false 关闭
    this.isBackupRequired = process.env.DSM_BACKUP_REQUIRED !== 'false';
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * 检查备份工具是否存在
   */
  private async checkToolExists(toolName: string): Promise<boolean> {
    try {
      await execAsync(`which ${toolName}`);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 执行数据库备份
   */
  async createBackup(dbType: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `backup_${dbType}_${timestamp}`);

    log.info('Backup', `Starting database backup for ${dbType}...`);

    try {
      if (dbType === 'sqlite') {
        const dbPath = process.env.DB_PATH || './data/dnsmgr.db';
        if (!fs.existsSync(dbPath)) {
          log.warn('Backup', 'SQLite database file not found, skipping backup.');
          return '';
        }
        fs.copyFileSync(dbPath, `${backupPath}.db`);
        log.info('Backup', `SQLite backup saved to ${backupPath}.db`);
        return `${backupPath}.db`;
      } 
      else if (dbType === 'mysql') {
        if (!(await this.checkToolExists('mysqldump'))) {
          const msg = 'mysqldump tool not found in PATH.';
          if (this.isBackupRequired) throw new Error(msg);
          log.warn('Backup', `${msg} Skipping backup due to configuration.`);
          return '';
        }
        const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
        const cmd = `mysqldump -h ${DB_HOST} -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME} > ${backupPath}.sql`;
        await execAsync(cmd);
        log.info('Backup', `MySQL backup saved to ${backupPath}.sql`);
        return `${backupPath}.sql`;
      }
      else if (dbType === 'postgresql') {
        if (!(await this.checkToolExists('pg_dump'))) {
          const msg = 'pg_dump tool not found in PATH.';
          if (this.isBackupRequired) throw new Error(msg);
          log.warn('Backup', `${msg} Skipping backup due to configuration.`);
          return '';
        }
        const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
        // 注意：pg_dump 可能需要 PGPASSWORD 环境变量
        const cmd = `PGPASSWORD=${DB_PASSWORD} pg_dump -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -f ${backupPath}.sql`;
        await execAsync(cmd);
        log.info('Backup', `PostgreSQL backup saved to ${backupPath}.sql`);
        return `${backupPath}.sql`;
      }

      throw new Error(`Unsupported database type for backup: ${dbType}`);
    } catch (error) {
      log.error('Backup', 'Backup failed:', error);
      throw error;
    }
  }

  /**
   * 清理旧备份（保留最近 N 天）
   */
  cleanup(retentionDays: number = 7): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const files = fs.readdirSync(this.backupDir);
    files.forEach(file => {
      const filePath = path.join(this.backupDir, file);
      const stats = fs.statSync(filePath);
      if (stats.mtime < cutoffDate) {
        fs.unlinkSync(filePath);
        log.info('Backup', `Deleted old backup: ${file}`);
      }
    });
  }
}
