import { SchemaReconciler } from './schema-reconciler';
import { COMPLETE_SCHEMA } from './schemas/complete-schema';
import { DataMigrationRunner, DataMigration } from './data-migration-runner';
import { SchemaVersionManager } from './migration-manager';
import { sqliteSchema } from './schemas/sqlite';
import { getConnection } from './connection';
import { log } from '../lib/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * HiDNS 声明式数据库初始化入口
 */
export async function initializeDSM(dryRun = false): Promise<void> {
  const reconciler = new SchemaReconciler();

  try {
    // Phase 0: 遗留系统检测
    const legacyCheck = await reconciler.detectLegacySystem();
    if (legacyCheck.isLegacy) {
      log.warn('DSM', `⚠️ Legacy system detected: ${legacyCheck.reason}`);
      log.info('DSM', 'Running in legacy upgrade mode. Performing full reconciliation...');
    } else {
      log.info('DSM', 'No legacy system detected. Proceeding with standard DSM initialization.');
    }

    log.info('DSM', `Starting full database schema reconciliation${dryRun ? ' (DRY RUN)' : ''}...`);
    
    // Phase 1: 结构同步
    await reconciler.reconcile(COMPLETE_SCHEMA, { dryRun });
    
    if (!dryRun) {
      // Phase 2: 数据迁移
      log.info('DSM', 'Running data migrations...');
      const runner = new DataMigrationRunner();
      registerDefaultMigrations(runner);
      const result = await runner.run({ dryRun });
      
      if (result.failed.length > 0) {
        log.error('DSM', 'Some migrations failed:', result.failed.map(f => f.id));
      }

      // Phase 3: 完整性自检
      log.info('DSM', 'Running integrity check...');
      const check = await reconciler.verify(COMPLETE_SCHEMA);
      
      if (check.valid) {
        log.info('DSM', '✅ All schemas are up to date and verified.');
      } else {
        log.error('DSM', '❌ Integrity check failed:', check.issues);
        throw new Error(`Schema integrity check failed: ${check.issues.join(', ')}`);
      }

      // Phase 4: 版本记录
      const conn = getConnection();
      const versionManager = new SchemaVersionManager(conn, sqliteSchema);
      
      // 动态获取项目版本号
      let appVersion = 'unknown';
      try {
        const pkgPath = path.join(__dirname, '../../package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        appVersion = pkg.version || 'dev';
      } catch (e) {
        log.warn('DSM', 'Failed to read package.json version');
      }

      await versionManager.recordDSMVersion(appVersion);
      log.info('DSM', `✅ DSM version ${appVersion} recorded.`);
    } else {
      log.warn('DSM', '⚠️ Dry run finished. No changes were made.');
    }
  } catch (error) {
    log.error('DSM', '❌ Schema reconciliation failed:', error);
    throw error;
  }
}

/**
 * 注册默认的数据迁移任务
 */
function registerDefaultMigrations(runner: DataMigrationRunner): void {
  // 示例：迁移 dnsmgr 类型的账户到 hidns
  runner.register({
    id: 'migrate-dns-account-type',
    description: 'Migrate dnsmgr account type to hidns',
    condition: async () => {
      const conn = getConnection();
      const res = await conn.get("SELECT COUNT(*) as cnt FROM dns_accounts WHERE type = 'dnsmgr'");
      return (res as any)?.cnt > 0;
    },
    execute: async () => {
      const conn = getConnection();
      await conn.execute("UPDATE dns_accounts SET type = 'hidns' WHERE type = 'dnsmgr'");
    }
  });

  // 示例：初始化默认安全策略
  runner.register({
    id: 'init-security-policies',
    description: 'Initialize default security policies',
    condition: async () => {
      const conn = getConnection();
      const res = await conn.get("SELECT COUNT(*) as cnt FROM security_policies");
      return (res as any)?.cnt === 0;
    },
    execute: async () => {
      const conn = getConnection();
      await conn.execute(`INSERT INTO security_policies 
        (require_2fa_global, min_password_length, session_timeout_hours, max_login_attempts)
        VALUES (0, 8, 24, 5)`);
    }
  });

  // 迁移 ns_monitor_domains.domain_name
  runner.register({
    id: 'migrate-ns-domain-name',
    description: 'Populate ns_monitor_domains.domain_name from domains table',
    dependsOn: ['init-security-policies'],
    condition: async () => {
      const conn = getConnection();
      const res = await conn.get("SELECT COUNT(*) as cnt FROM ns_monitor_domains WHERE domain_name IS NULL OR domain_name = ''");
      return (res as any)?.cnt > 0;
    },
    execute: async () => {
      const conn = getConnection();
      const type = conn.type;
      if (type === 'mysql' || type === 'postgresql') {
        await conn.execute(`UPDATE ns_monitor_domains nmd SET domain_name = (
          SELECT d.name FROM domains d WHERE d.id = nmd.domain_id
        ) WHERE nmd.domain_name IS NULL OR nmd.domain_name = ''`);
      } else {
        // SQLite 需要不同的语法
        await conn.execute(`UPDATE ns_monitor_domains SET domain_name = (
          SELECT domains.name FROM domains WHERE domains.id = ns_monitor_domains.domain_id
        ) WHERE domain_name IS NULL OR domain_name = ''`);
      }
    }
  });

  // 迁移：添加 apex_expires_at 和 whois_status 到 domains
  runner.register({
    id: 'migrate-domains-whois-fields',
    description: 'Add apex_expires_at and whois_status to domains table',
    dependsOn: ['migrate-ns-domain-name'],
    condition: async () => {
      const conn = getConnection();
      let cols: any[];
      if (conn.type === 'sqlite') {
        cols = await conn.query(`PRAGMA table_info(domains)`);
      } else if (conn.type === 'mysql') {
        cols = await conn.query("SELECT COLUMN_NAME as name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = (SELECT DATABASE()) AND TABLE_NAME = 'domains'");
      } else {
        cols = await conn.query("SELECT column_name as name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = current_schema() AND TABLE_NAME = 'domains'");
      }
      return !cols.some((c: any) => c.name.replace(/["'`]/g, '') === 'apex_expires_at');
    },
    execute: async () => {
      const conn = getConnection();
      try { await conn.execute('ALTER TABLE domains ADD COLUMN apex_expires_at DATETIME'); } catch {}
      try { await conn.execute('ALTER TABLE domains ADD COLUMN whois_status TEXT'); } catch {}
    }
  });

  // 迁移：添加 enabled 字段到 domains
  runner.register({
    id: 'migrate-domains-enabled',
    description: 'Add enabled column to domains table',
    dependsOn: ['migrate-domains-whois-fields'],
    condition: async () => {
      const conn = getConnection();
      let cols: any[];
      if (conn.type === 'sqlite') {
        cols = await conn.query(`PRAGMA table_info(domains)`);
      } else if (conn.type === 'mysql') {
        cols = await conn.query("SELECT COLUMN_NAME as name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = (SELECT DATABASE()) AND TABLE_NAME = 'domains'");
      } else {
        cols = await conn.query("SELECT column_name as name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = current_schema() AND TABLE_NAME = 'domains'");
      }
      return !cols.some((c: any) => c.name.replace(/["'`]/g, '') === 'enabled');
    },
    execute: async () => {
      const conn = getConnection();
      try { await conn.execute('ALTER TABLE domains ADD COLUMN enabled BOOLEAN DEFAULT 1'); } catch {}
    }
  });

  // 迁移：dns_accounts.enabled Export-Rebuild (SQLite/MySQL)
  runner.register({
    id: 'migrate-dns-accounts-enabled-rebuild',
    description: 'Add enabled column to dns_accounts via export-rebuild pattern',
    dependsOn: ['migrate-domains-enabled'],
    condition: async () => {
      const conn = getConnection();
      if (conn.type === 'sqlite') {
        const cols = await conn.query(`PRAGMA table_info(dns_accounts)`);
        return !cols.some((c: any) => c.name.replace(/["'`]/g, '') === 'enabled');
      } else {
        const res = await conn.get("SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'dns_accounts' AND COLUMN_NAME = 'enabled'");
        return (res as any)?.cnt === 0;
      }
    },
    execute: async () => {
      const conn = getConnection();
      const type = conn.type;
      
      if (type === 'mysql') {
        // MySQL Export-Rebuild
        await conn.execute('DROP TABLE IF EXISTS dns_accounts_new');
        await conn.execute(`CREATE TABLE dns_accounts_new (
          id INT AUTO_INCREMENT PRIMARY KEY, type VARCHAR(100) NOT NULL, name VARCHAR(255) NOT NULL,
          config JSON, remark TEXT, created_by INT NOT NULL, team_id INT DEFAULT NULL,
          enabled TINYINT(1) NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_created_by (created_by), INDEX idx_team_id (team_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        
        await conn.execute(`INSERT INTO dns_accounts_new (id, type, name, config, remark, created_by, team_id, enabled, created_at)
          SELECT id, type, name, config, remark, created_by, team_id, 1, created_at FROM dns_accounts`);
        
        await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
        await conn.execute('DROP TABLE dns_accounts');
        await conn.execute('ALTER TABLE dns_accounts_new RENAME TO dns_accounts');
        await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
      } else if (type === 'sqlite') {
        // SQLite Export-Rebuild
        await conn.execute('DROP TABLE IF EXISTS dns_accounts_new');
        await conn.execute(`CREATE TABLE dns_accounts_new AS SELECT id, type, name, config, remark, created_by, team_id, 1 as enabled, created_at FROM dns_accounts`);
        await conn.execute('DROP TABLE dns_accounts');
        await conn.execute('ALTER TABLE dns_accounts_new RENAME TO dns_accounts');
      }
    }
  });

  // 迁移：ns_monitor_domains 去重与 domain_id 清理
  runner.register({
    id: 'migrate-ns-monitor-cleanup',
    description: 'Deduplicate ns_monitor_domains and drop domain_id column',
    dependsOn: ['migrate-ns-domain-name'],
    condition: async () => {
      const conn = getConnection();
      if (conn.type === 'sqlite') {
        const cols = await conn.query(`PRAGMA table_info(ns_monitor_domains)`);
        return cols.some((c: any) => c.name.replace(/["'`]/g, '') === 'domain_id');
      } else {
        const res = await conn.get("SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ns_monitor_domains' AND COLUMN_NAME = 'domain_id'");
        return (res as any)?.cnt > 0;
      }
    },
    execute: async () => {
      const conn = getConnection();
      const type = conn.type;

      // 1. 去重
      if (type === 'mysql') {
        await conn.execute(`DELETE n1 FROM ns_monitor_domains n1 INNER JOIN ns_monitor_domains n2 
          WHERE n1.id > n2.id AND n1.user_id = n2.user_id AND n1.domain_name = n2.domain_name`);
      } else {
        await conn.execute(`DELETE FROM ns_monitor_domains WHERE rowid NOT IN (
          SELECT MIN(rowid) FROM ns_monitor_domains GROUP BY user_id, domain_name
        )`);
      }

      // 2. 删除 domain_id (使用重建模式以兼容 SQLite)
      if (type === 'sqlite') {
        await conn.execute('DROP TABLE IF EXISTS ns_monitor_domains_new');
        await conn.execute(`CREATE TABLE ns_monitor_domains_new AS 
          SELECT id, user_id, domain_name, expected_ns, current_ns, encrypted_ns, plain_ns,
                 is_poisoned, status, enabled, last_check_at, last_alert_at, alert_count, created_at, updated_at
          FROM ns_monitor_domains`);
        await conn.execute('DROP TABLE ns_monitor_domains');
        await conn.execute('ALTER TABLE ns_monitor_domains_new RENAME TO ns_monitor_domains');
        // 重建索引
        await conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS unique_user_domain ON ns_monitor_domains(user_id, domain_name)');
      } else {
        try { await conn.execute('ALTER TABLE ns_monitor_domains DROP FOREIGN KEY ns_monitor_domains_ibfk_1'); } catch {}
        await conn.execute('ALTER TABLE ns_monitor_domains DROP COLUMN domain_id');
      }
    }
  });

  // 迁移：清理旧 NS 监测表
  runner.register({
    id: 'cleanup-old-ns-tables',
    description: 'Drop deprecated ns_monitor_configs, status, and alerts tables',
    dependsOn: ['migrate-ns-monitor-cleanup'],
    condition: async () => {
      const conn = getConnection();
      let tables: any[];
      if (conn.type === 'sqlite') {
        tables = await conn.query("SELECT name FROM sqlite_master WHERE type='table'");
      } else if (conn.type === 'mysql') {
        tables = await conn.query("SHOW TABLES");
      } else {
        tables = await conn.query("SELECT tablename as name FROM pg_catalog.pg_tables WHERE schemaname = 'public'");
      }
      const names = tables.map((t: any) => t.name || Object.values(t)[0]);
      return names.some((n: string) => ['ns_monitor_configs', 'ns_monitor_status', 'ns_monitor_alerts'].includes(n));
    },
    execute: async () => {
      const conn = getConnection();
      await conn.execute('DROP TABLE IF EXISTS ns_monitor_configs');
      await conn.execute('DROP TABLE IF EXISTS ns_monitor_status');
      await conn.execute('DROP TABLE IF EXISTS ns_monitor_alerts');
    }
  });
}
