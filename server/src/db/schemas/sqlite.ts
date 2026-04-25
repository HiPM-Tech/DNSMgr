import { SchemaDefinition } from './index';

/**
 * SQLite 数据库禁忌事项 / SQLite Database Restrictions:
 *
 * 1. ALTER TABLE 功能非常有限
 *    - 不支持 DROP COLUMN (3.35.0+ 才支持)
 *    - 不支持 ALTER COLUMN
 *    - 不支持 ADD CONSTRAINT
 *    - 修改列需要: 创建新表 -> 复制数据 -> 删除旧表 -> 重命名
 *
 * 2. 外键约束默认关闭
 *    - 需要手动执行: PRAGMA foreign_keys = ON
 *    - 每次连接都需要设置
 *
 * 3. TEXT 类型可以有默认值
 *    - 支持: TEXT NOT NULL DEFAULT ''
 *    - 与 MySQL 不同
 *
 * 4. 布尔类型使用 INTEGER (0/1)
 *    - 不支持 BOOLEAN 关键字（虽然可以写，但会被忽略）
 *    - 使用 0 表示 false，1 表示 true
 *
 * 5. 日期时间使用 TEXT 存储
 *    - 推荐格式: 'YYYY-MM-DD HH:MM:SS'
 *    - 使用 datetime('now') 获取当前时间
 *
 * 6. 自增主键使用 INTEGER PRIMARY KEY AUTOINCREMENT
 *    - 注意: 只有 INTEGER 类型才能使用 AUTOINCREMENT
 *    - 或者使用 ROWID 别名: INTEGER PRIMARY KEY
 *
 * 7. CHECK 约束在创建表时生效
 *    - 但修改 CHECK 约束需要重建表
 *
 * 8. 并发写入性能较差
 *    - 写操作会锁定整个数据库
 *    - 不适合高并发写入场景
 *
 * 9. ALTER TABLE ADD COLUMN IF NOT EXISTS 支持良好
 *    - 从 3.2.0 版本开始支持
 */

export const sqliteSchema: SchemaDefinition = {
  createTables: [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      nickname TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
      role_level INTEGER NOT NULL DEFAULT 1,
      status INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member')),
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(team_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS dns_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      remark TEXT NOT NULL DEFAULT '',
      created_by INTEGER NOT NULL,
      team_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    )`,
    `CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      third_id TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      is_hidden INTEGER NOT NULL DEFAULT 0,
      record_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      apex_expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES dns_accounts(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS domain_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      team_id INTEGER,
      domain_id INTEGER NOT NULL,
      sub TEXT NOT NULL DEFAULT '',
      permission TEXT NOT NULL DEFAULT 'write' CHECK(permission IN ('read', 'write')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      domain TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
        `CREATE TABLE IF NOT EXISTS oauth_user_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      subject TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(provider, subject),
      UNIQUE(user_id, provider)
    )`,
    `CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      mode TEXT NOT NULL CHECK(mode IN ('login', 'bind')),
      provider TEXT NOT NULL,
      user_id INTEGER,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_oauth_state_expires ON oauth_states(expires_at)`,
`CREATE TABLE IF NOT EXISTS runtime_secrets (
      "key" TEXT PRIMARY KEY,
      "value" TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS user_2fa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'totp' CHECK(type IN ('totp', 'webauthn')),
      secret TEXT NOT NULL,
      backup_codes TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, type)
    )`,
    `CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      device_type TEXT NOT NULL DEFAULT '',
      backed_up INTEGER NOT NULL DEFAULT 0,
      transports TEXT NOT NULL DEFAULT '[]',
      name TEXT NOT NULL DEFAULT 'Passkey',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      user_agent TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL,
      ip_address TEXT NOT NULL DEFAULT '',
      attempt_count INTEGER NOT NULL DEFAULT 1,
      last_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS system_settings (
      "key" TEXT PRIMARY KEY,
      "value" TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS user_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      theme TEXT NOT NULL DEFAULT 'auto' CHECK(theme IN ('light', 'dark', 'auto')),
      language TEXT NOT NULL DEFAULT 'zh-CN',
      notifications_enabled INTEGER NOT NULL DEFAULT 1,
      email_notifications INTEGER NOT NULL DEFAULT 1,
      background_image TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS user_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      allowed_domains TEXT NOT NULL DEFAULT '[]',
      allowed_services TEXT NOT NULL DEFAULT '[]',
      start_time TEXT,
      end_time TEXT,
      max_role INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS failover_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain_id INTEGER NOT NULL,
      record_id INTEGER NOT NULL,
      record_type TEXT NOT NULL,
      record_name TEXT NOT NULL,
      primary_value TEXT NOT NULL,
      backup_value TEXT NOT NULL,
      check_interval INTEGER NOT NULL DEFAULT 60,
      check_timeout INTEGER NOT NULL DEFAULT 5,
      check_method TEXT NOT NULL DEFAULT 'ping',
      check_port INTEGER,
      check_path TEXT,
      check_expect TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS failover_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id INTEGER NOT NULL,
      current_value TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'primary' CHECK(status IN ('primary', 'backup', 'unknown')),
      last_check_at TEXT,
      last_failover_at TEXT,
      fail_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (config_id) REFERENCES failover_configs(id) ON DELETE CASCADE,
      UNIQUE(config_id)
    )`,
    `CREATE TABLE IF NOT EXISTS security_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      require_2fa_global INTEGER NOT NULL DEFAULT 0,
      min_password_length INTEGER NOT NULL DEFAULT 8,
      min_password_strength INTEGER NOT NULL DEFAULT 2,
      session_timeout_hours INTEGER NOT NULL DEFAULT 24,
      max_login_attempts INTEGER NOT NULL DEFAULT 5,
      lockout_duration_minutes INTEGER NOT NULL DEFAULT 30,
      allow_remember_device INTEGER NOT NULL DEFAULT 1,
      trusted_device_days INTEGER NOT NULL DEFAULT 30,
      require_password_change_on_first_login INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS user_security_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      require_2fa INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS user_totp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      secret TEXT NOT NULL,
      backup_codes TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS user_webauthn_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      credential_id TEXT NOT NULL,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS trusted_devices (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      device_name TEXT NOT NULL,
      device_fingerprint TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS ns_monitor_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain_id INTEGER NOT NULL,
      expected_ns TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 0,
      notify_email INTEGER NOT NULL DEFAULT 1,
      notify_channels INTEGER NOT NULL DEFAULT 1,
      check_interval INTEGER NOT NULL DEFAULT 3600,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS ns_monitor_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id INTEGER NOT NULL,
      current_ns TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ok' CHECK(status IN ('ok', 'mismatch', 'missing')),
      last_check_at TEXT,
      last_alert_at TEXT,
      alert_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (config_id) REFERENCES ns_monitor_configs(id) ON DELETE CASCADE,
      UNIQUE(config_id)
    )`,
    `CREATE TABLE IF NOT EXISTS ns_monitor_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id INTEGER NOT NULL,
      alert_type TEXT NOT NULL CHECK(alert_type IN ('mismatch', 'missing')),
      expected_ns TEXT NOT NULL DEFAULT '',
      actual_ns TEXT NOT NULL DEFAULT '',
      sent_email INTEGER NOT NULL DEFAULT 0,
      sent_channels INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (config_id) REFERENCES ns_monitor_configs(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS user_ns_monitor_prefs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      notify_email INTEGER NOT NULL DEFAULT 1,
      notify_channels INTEGER NOT NULL DEFAULT 1,
      check_interval INTEGER NOT NULL DEFAULT 3600,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS ns_monitor_domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      domain_id INTEGER NOT NULL,
      expected_ns TEXT NOT NULL DEFAULT '',
      current_ns TEXT NOT NULL DEFAULT '',
      encrypted_ns TEXT,
      plain_ns TEXT,
      is_poisoned INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ok' CHECK(status IN ('ok', 'mismatch', 'missing', 'poisoned')),
      enabled INTEGER NOT NULL DEFAULT 1,
      last_check_at TEXT,
      last_alert_at TEXT,
      alert_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
      UNIQUE(user_id, domain_id)
    )`,
    `CREATE TABLE IF NOT EXISTS rdap_server_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tld TEXT NOT NULL UNIQUE,
      servers TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS system_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key TEXT NOT NULL UNIQUE,
      cache_value TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ],
  createIndexes: [
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_account_name_unique ON domains(account_id, name)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_permissions_unique ON domain_permissions(domain_id, user_id, team_id, sub)`,
    `CREATE INDEX IF NOT EXISTS idx_user_tokens_user_id ON user_tokens(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_tokens_token_hash ON user_tokens(token_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_failover_configs_domain_id ON failover_configs(domain_id)`,
    `CREATE INDEX IF NOT EXISTS idx_failover_configs_enabled ON failover_configs(enabled)`,
    `CREATE INDEX IF NOT EXISTS idx_failover_status_config_id ON failover_status(config_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_security_settings_user_id ON user_security_settings(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_totp_user_id ON user_totp(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_webauthn_credentials_user_id ON user_webauthn_credentials(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_id ON trusted_devices(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_trusted_devices_fingerprint ON trusted_devices(device_fingerprint)`,
    `CREATE INDEX IF NOT EXISTS idx_user_ns_monitor_prefs_user_id ON user_ns_monitor_prefs(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ns_monitor_domains_user_id ON ns_monitor_domains(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ns_monitor_domains_domain_id ON ns_monitor_domains(domain_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ns_monitor_domains_enabled ON ns_monitor_domains(enabled)`,
  ],
  alterTables: [
    // SQLite 不支持直接修改 CHECK 约束
    // 对于已存在的数据库，需要手动重建表或使用迁移脚本
    // 新创建的表将自动使用更新后的 CHECK 约束
    // 注意：SQLite 迁移需要特殊处理，以下是一个示例迁移流程（需要手动执行）
    // 1. 创建新表 team_members_new 带有新的 CHECK 约束
    // 2. 复制数据
    // 3. 删除旧表
    // 4. 重命名新表
    // Migration: Add apex_expires_at column to domains table for subdomain expiry tracking
    `ALTER TABLE domains ADD COLUMN IF NOT EXISTS apex_expires_at TEXT`,
    // Migration: Add encrypted_ns, plain_ns, is_poisoned columns to ns_monitor_domains for DNS pollution detection
    `ALTER TABLE ns_monitor_domains ADD COLUMN IF NOT EXISTS encrypted_ns TEXT`,
    `ALTER TABLE ns_monitor_domains ADD COLUMN IF NOT EXISTS plain_ns TEXT`,
    `ALTER TABLE ns_monitor_domains ADD COLUMN IF NOT EXISTS is_poisoned INTEGER NOT NULL DEFAULT 0`
  ],
};
