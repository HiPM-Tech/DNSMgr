import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { log } from '../../lib/logger';

const execAsync = promisify(exec);

export class BackupManager {
  private backupDir: string;
  private isBackupRequired: boolean;

  constructor() {
    this.backupDir = path.join(process.cwd(), 'data', 'backups');
    this.isBackupRequired = process.env.DSM_BACKUP_REQUIRED !== 'false';
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  private async checkToolExists(toolName: string): Promise<boolean> {
    try {
      await execAsync(`which ${toolName}`);
      return true;
    } catch (e) {
      return false;
    }
  }

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
        const cmd = `mysqldump --skip-ssl --default-auth=mysql_native_password -h ${DB_HOST} -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME} > ${backupPath}.sql`;
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

  cleanup(retentionDays: number = 7): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const files = fs.readdirSync(this.backupDir)
      .filter(file => file.startsWith('backup_') && (file.endsWith('.db') || file.endsWith('.sql')));

    for (const file of files) {
      const filePath = path.join(this.backupDir, file);
      const stats = fs.statSync(filePath);
      if (stats.mtime < cutoffDate) {
        fs.unlinkSync(filePath);
        log.info('Backup', `Deleted old backup: ${file}`);
      }
    }
  }
}