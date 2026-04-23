/**
 * 数据库回滚脚本（测试用）
 * 实际调用 db-migrate.ts 的 down 模式
 */

import { execSync } from 'child_process';
import { log } from '../src/lib/logger';
import path from 'path';

async function rollback() {
  log.info('DBRollback', 'Starting database rollback');

  try {
    const scriptPath = path.join(__dirname, 'db-migrate.ts');

    // 调用迁移脚本的 down 模式
    execSync(`ts-node "${scriptPath}" down`, {
      cwd: process.cwd(),
      stdio: 'inherit'
    });

    log.info('DBRollback', 'Rollback completed successfully!');
    process.exit(0);
  } catch (error) {
    log.error('DBRollback', 'Rollback failed', error);
    process.exit(1);
  }
}

rollback();
