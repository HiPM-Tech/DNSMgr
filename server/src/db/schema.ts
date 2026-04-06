import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDb, SQLiteConnection } from './database';

// SQLite Schema
const sqliteSchema = {
  tables: [
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
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'member')),
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
    `CREATE TABLE IF NOT EXISTS runtime_secrets (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS user_2fa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
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
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS user_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      theme TEXT NOT NULL DEFAULT 'auto' CHECK(theme IN ('light', 'dark', 'auto')),
      language TEXT NOT NULL DEFAULT 'zh-CN',
      notifications_enabled INTEGER NOT NULL DEFAULT 1,
      email_notifications INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS failover_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain_id INTEGER NOT NULL UNIQUE,
      primary_ip TEXT NOT NULL,
      backup_ips TEXT NOT NULL DEFAULT '[]',
      check_method TEXT NOT NULL DEFAULT 'http' CHECK(check_method IN ('http', 'tcp', 'ping')),
      check_interval INTEGER NOT NULL DEFAULT 300,
      check_port INTEGER NOT NULL DEFAULT 80,
      check_path TEXT,
      auto_switch_back INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS failover_status (
      config_id INTEGER PRIMARY KEY,
      current_ip TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 1,
      last_check_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_check_status INTEGER NOT NULL DEFAULT 1,
      switch_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (config_id) REFERENCES failover_configs(id) ON DELETE CASCADE
    )`,
  ],
  indexes: [
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_account_name_unique ON domains(account_id, name)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_permissions_unique ON domain_permissions(domain_id, user_id, team_id, sub)`,
  ],
};

// MySQL Schema
const mysqlSchema = {
  tables: [
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      nickname VARCHAR(255) NOT NULL DEFAULT '',
      email VARCHAR(255) NOT NULL DEFAULT '',
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin', 'member') NOT NULL DEFAULT 'member',
      role_level INT NOT NULL DEFAULT 1,
      status TINYINT NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_username (username),
      INDEX idx_role (role),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS teams (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      created_by INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_created_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS team_members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      team_id INT NOT NULL,
      user_id INT NOT NULL,
      role ENUM('owner', 'member') NOT NULL DEFAULT 'member',
      joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY unique_team_user (team_id, user_id),
      INDEX idx_team_id (team_id),
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS dns_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(100) NOT NULL,
      name VARCHAR(255) NOT NULL,
      config JSON,
      remark TEXT,
      created_by INT NOT NULL,
      team_id INT DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
      INDEX idx_created_by (created_by),
      INDEX idx_team_id (team_id),
      INDEX idx_type (type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS domains (
      id INT AUTO_INCREMENT PRIMARY KEY,
      account_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      third_id VARCHAR(255) NOT NULL DEFAULT '',
      remark TEXT,
      is_hidden TINYINT NOT NULL DEFAULT 0,
      record_count INT NOT NULL DEFAULT 0,
      expires_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES dns_accounts(id) ON DELETE CASCADE,
      UNIQUE KEY unique_account_name (account_id, name),
      INDEX idx_account_id (account_id),
      INDEX idx_name (name),
      INDEX idx_is_hidden (is_hidden)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS domain_permissions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT DEFAULT NULL,
      team_id INT DEFAULT NULL,
      domain_id INT NOT NULL,
      sub VARCHAR(255) NOT NULL DEFAULT '',
      permission ENUM('read', 'write') NOT NULL DEFAULT 'write',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
      UNIQUE KEY unique_permission (domain_id, user_id, team_id, sub),
      INDEX idx_user_id (user_id),
      INDEX idx_team_id (team_id),
      INDEX idx_domain_id (domain_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS operation_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      action VARCHAR(255) NOT NULL,
      domain VARCHAR(255) NOT NULL DEFAULT '',
      data JSON,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_action (action),
      INDEX idx_domain (domain),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS oauth_user_links (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      provider VARCHAR(100) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY unique_provider_subject (provider, subject),
      UNIQUE KEY unique_user_provider (user_id, provider),
      INDEX idx_oauth_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS runtime_secrets (
      \`key\` VARCHAR(255) PRIMARY KEY,
      \`value\` TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS user_2fa (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      type VARCHAR(50) NOT NULL DEFAULT 'totp' CHECK(type IN ('totp', 'webauthn')),
      secret VARCHAR(255) NOT NULL,
      backup_codes JSON,
      enabled TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_type (user_id, type),
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id VARCHAR(255) PRIMARY KEY,
      user_id INT NOT NULL,
      public_key TEXT NOT NULL,
      counter INT NOT NULL DEFAULT 0,
      device_type VARCHAR(50) NOT NULL DEFAULT '',
      backed_up TINYINT NOT NULL DEFAULT 0,
      transports JSON,
      name VARCHAR(255) NOT NULL DEFAULT 'Passkey',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS user_sessions (
      id VARCHAR(255) PRIMARY KEY,
      user_id INT NOT NULL,
      token VARCHAR(500) NOT NULL UNIQUE,
      ip_address VARCHAR(255) NOT NULL DEFAULT '',
      user_agent TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_activity_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS user_preferences (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      theme VARCHAR(50) NOT NULL DEFAULT 'auto' CHECK(theme IN ('light', 'dark', 'auto')),
      language VARCHAR(50) NOT NULL DEFAULT 'zh-CN',
      notifications_enabled TINYINT NOT NULL DEFAULT 1,
      email_notifications TINYINT NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS failover_configs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      domain_id INT NOT NULL UNIQUE,
      primary_ip VARCHAR(255) NOT NULL,
      backup_ips JSON,
      check_method VARCHAR(50) NOT NULL DEFAULT 'http' CHECK(check_method IN ('http', 'tcp', 'ping')),
      check_interval INT NOT NULL DEFAULT 300,
      check_port INT NOT NULL DEFAULT 80,
      check_path VARCHAR(255),
      auto_switch_back TINYINT NOT NULL DEFAULT 1,
      enabled TINYINT NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
      INDEX idx_domain_id (domain_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS failover_status (
      config_id INT PRIMARY KEY,
      current_ip VARCHAR(255) NOT NULL,
      is_primary TINYINT NOT NULL DEFAULT 1,
      last_check_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_check_status TINYINT NOT NULL DEFAULT 1,
      switch_count INT NOT NULL DEFAULT 0,
      FOREIGN KEY (config_id) REFERENCES failover_configs(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
};

// PostgreSQL Schema
const postgresqlSchema = {
  tables: [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      nickname VARCHAR(255) NOT NULL DEFAULT '',
      email VARCHAR(255) NOT NULL DEFAULT '',
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
      role_level INTEGER NOT NULL DEFAULT 1,
      status SMALLINT NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
    `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`,
    `CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)`,
    `CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql'`,
    `DROP TRIGGER IF EXISTS update_users_updated_at ON users`,
    `CREATE TRIGGER update_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()`,
    `CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_teams_created_by ON teams(created_by)`,
    `CREATE TABLE IF NOT EXISTS team_members (
      id SERIAL PRIMARY KEY,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
      joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(team_id, user_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id)`,
    `CREATE TABLE IF NOT EXISTS dns_accounts (
      id SERIAL PRIMARY KEY,
      type VARCHAR(100) NOT NULL,
      name VARCHAR(255) NOT NULL,
      config JSONB NOT NULL DEFAULT '{}',
      remark TEXT NOT NULL DEFAULT '',
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_dns_accounts_created_by ON dns_accounts(created_by)`,
    `CREATE INDEX IF NOT EXISTS idx_dns_accounts_team_id ON dns_accounts(team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_dns_accounts_type ON dns_accounts(type)`,
    `CREATE TABLE IF NOT EXISTS domains (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES dns_accounts(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      third_id VARCHAR(255) NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      is_hidden SMALLINT NOT NULL DEFAULT 0,
      record_count INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(account_id, name)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_domains_account_id ON domains(account_id)`,
    `CREATE INDEX IF NOT EXISTS idx_domains_name ON domains(name)`,
    `CREATE INDEX IF NOT EXISTS idx_domains_is_hidden ON domains(is_hidden)`,
    `CREATE TABLE IF NOT EXISTS domain_permissions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
      domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
      sub VARCHAR(255) NOT NULL DEFAULT '',
      permission VARCHAR(20) NOT NULL DEFAULT 'write' CHECK (permission IN ('read', 'write')),
      UNIQUE(domain_id, user_id, team_id, sub)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_domain_permissions_user_id ON domain_permissions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_domain_permissions_team_id ON domain_permissions(team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_domain_permissions_domain_id ON domain_permissions(domain_id)`,
    `CREATE TABLE IF NOT EXISTS operation_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action VARCHAR(255) NOT NULL,
      domain VARCHAR(255) NOT NULL DEFAULT '',
      data JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_operation_logs_user_id ON operation_logs(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_operation_logs_action ON operation_logs(action)`,
    `CREATE INDEX IF NOT EXISTS idx_operation_logs_domain ON operation_logs(domain)`,
    `CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at)`,
    `CREATE TABLE IF NOT EXISTS oauth_user_links (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider VARCHAR(100) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, subject),
      UNIQUE(user_id, provider)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_oauth_user_links_user_id ON oauth_user_links(user_id)`,
    `CREATE TABLE IF NOT EXISTS runtime_secrets (
      key VARCHAR(255) PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS login_attempts (
      id SERIAL PRIMARY KEY,
      identifier VARCHAR(255) NOT NULL,
      ip_address VARCHAR(255) NOT NULL DEFAULT '',
      attempt_count INTEGER NOT NULL DEFAULT 1,
      last_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      locked_until TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts(identifier)`,
    `CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address)`,
    `CREATE INDEX IF NOT EXISTS idx_login_attempts_locked ON login_attempts(locked_until)`,
    `CREATE TABLE IF NOT EXISTS system_settings (
      key VARCHAR(255) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_2fa (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL DEFAULT 'totp' CHECK(type IN ('totp', 'webauthn')),
      secret VARCHAR(255) NOT NULL,
      backup_codes JSONB NOT NULL DEFAULT '[]',
      enabled BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, type)
    )`,
    `CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id VARCHAR(255) PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      device_type VARCHAR(50) NOT NULL DEFAULT '',
      backed_up BOOLEAN NOT NULL DEFAULT false,
      transports JSONB NOT NULL DEFAULT '[]',
      name VARCHAR(255) NOT NULL DEFAULT 'Passkey',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_2fa_user_id ON user_2fa(user_id)`,
    `CREATE TABLE IF NOT EXISTS user_sessions (
      id VARCHAR(255) PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(500) NOT NULL UNIQUE,
      ip_address VARCHAR(255) NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_activity_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)`,
    `CREATE TABLE IF NOT EXISTS user_preferences (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      theme VARCHAR(50) NOT NULL DEFAULT 'auto' CHECK(theme IN ('light', 'dark', 'auto')),
      language VARCHAR(50) NOT NULL DEFAULT 'zh-CN',
      notifications_enabled BOOLEAN NOT NULL DEFAULT true,
      email_notifications BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id)`,
    `CREATE TABLE IF NOT EXISTS failover_configs (
      id SERIAL PRIMARY KEY,
      domain_id INTEGER NOT NULL UNIQUE REFERENCES domains(id) ON DELETE CASCADE,
      primary_ip VARCHAR(255) NOT NULL,
      backup_ips JSONB NOT NULL DEFAULT '[]',
      check_method VARCHAR(50) NOT NULL DEFAULT 'http' CHECK(check_method IN ('http', 'tcp', 'ping')),
      check_interval INTEGER NOT NULL DEFAULT 300,
      check_port INTEGER NOT NULL DEFAULT 80,
      check_path VARCHAR(255),
      auto_switch_back BOOLEAN NOT NULL DEFAULT true,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_failover_configs_domain_id ON failover_configs(domain_id)`,
    `CREATE TABLE IF NOT EXISTS failover_status (
      config_id INTEGER PRIMARY KEY REFERENCES failover_configs(id) ON DELETE CASCADE,
      current_ip VARCHAR(255) NOT NULL,
      is_primary BOOLEAN NOT NULL DEFAULT true,
      last_check_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_check_status BOOLEAN NOT NULL DEFAULT true,
      switch_count INTEGER NOT NULL DEFAULT 0
    )`,
  ],
};

// Synchronous initSchema for backward compatibility (SQLite only)
export function initSchema(): void {
  const conn = getDb();
  
  if (conn.type !== 'sqlite') {
    throw new Error('initSchema() only supports SQLite. Use initSchemaAsync() for MySQL/PostgreSQL.');
  }
  
  initSQLiteSchema(conn as SQLiteConnection);
}

// Async initSchema for all database types
export async function initSchemaAsync(conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<void> }, reset: boolean = false): Promise<void> {
  if (conn.type === 'sqlite') {
    // For SQLite, use sync version
    initSQLiteSchema(conn as SQLiteConnection, reset);
  } else if (conn.type === 'mysql') {
    await initMySQLSchema(conn as { execute: (sql: string, params?: unknown[]) => Promise<void> }, reset);
  } else if (conn.type === 'postgresql') {
    await initPostgreSQLSchema(conn as { execute: (sql: string, params?: unknown[]) => Promise<void> }, reset);
  }
}

function initSQLiteSchema(conn: SQLiteConnection, reset: boolean = false): void {
  // If reset, drop all tables first
  if (reset) {
    const tables = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
    for (const table of tables) {
      try {
        conn.exec(`DROP TABLE IF EXISTS "${table.name}"`);
      } catch (e) {
        console.warn(`[DB] Failed to drop table ${table.name}:`, e);
      }
    }
  }

  // Create tables
  for (const sql of sqliteSchema.tables) {
    conn.exec(sql);
  }

  // Create indexes
  for (const sql of sqliteSchema.indexes) {
    conn.exec(sql);
  }

  // Check and add columns (SQLite's ALTER TABLE support is limited)
  const userColumns = conn.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const hasNickname = userColumns.some((col) => col.name === 'nickname');
  if (!hasNickname) {
    conn.exec("ALTER TABLE users ADD COLUMN nickname TEXT NOT NULL DEFAULT ''");
    conn.exec("UPDATE users SET nickname = username WHERE nickname = '' OR nickname IS NULL");
  }

  const hasRoleLevel = userColumns.some((col) => col.name === 'role_level');
  if (!hasRoleLevel) {
    conn.exec('ALTER TABLE users ADD COLUMN role_level INTEGER NOT NULL DEFAULT 1');
    conn.exec("UPDATE users SET role_level = CASE role WHEN 'admin' THEN 2 ELSE 1 END");
  }

  const permColumns = conn.prepare("PRAGMA table_info(domain_permissions)").all() as { name: string }[];
  const hasPermission = permColumns.some((col) => col.name === 'permission');
  if (!hasPermission) {
    conn.exec("ALTER TABLE domain_permissions ADD COLUMN permission TEXT NOT NULL DEFAULT 'write'");
  }

  // Normalize historical duplicate domains
  conn.exec(`
    DELETE FROM domains
    WHERE id IN (
      SELECT d1.id
      FROM domains d1
      JOIN domains d2
        ON d1.account_id = d2.account_id
       AND lower(trim(d1.name)) = lower(trim(d2.name))
       AND d1.id > d2.id
    );
  `);
}

async function initMySQLSchema(conn: { execute: (sql: string, params?: unknown[]) => Promise<void>; query?: (sql: string) => Promise<[any[], any[]]> }, reset: boolean = false): Promise<void> {
  // If reset, drop all tables first
  if (reset) {
    try {
      // Get all tables
      const [tables] = await (conn as any).query?.("SHOW TABLES") || [[]];
      for (const table of tables) {
        const tableName = Object.values(table)[0] as string;
        try {
          await conn.execute(`DROP TABLE IF EXISTS \`${tableName}\``);
        } catch (e) {
          console.warn(`[DB] Failed to drop table ${tableName}:`, e);
        }
      }
    } catch (e) {
      console.warn('[DB] Failed to get tables for reset:', e);
    }
  }

  // Create tables
  for (const sql of mysqlSchema.tables) {
    await conn.execute(sql);
  }
}

async function initPostgreSQLSchema(conn: { execute: (sql: string, params?: unknown[]) => Promise<void>; query?: (sql: string) => Promise<{ rows: any[] }> }, reset: boolean = false): Promise<void> {
  // If reset, drop all tables first
  if (reset) {
    try {
      // Get all tables in public schema
      const result = await (conn as any).query?.(`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public'
      `);
      const tables = result?.rows?.map((row: any) => row.tablename) || [];
      
      // Drop tables in reverse order to handle foreign key constraints
      for (const tableName of tables.reverse()) {
        try {
          await conn.execute(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
        } catch (e) {
          console.warn(`[DB] Failed to drop table ${tableName}:`, e);
        }
      }
      
      // Also drop functions and triggers
      try {
        await conn.execute(`DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE`);
      } catch (e) {
        // Ignore
      }
    } catch (e) {
      console.warn('[DB] Failed to get tables for reset:', e);
    }
  }

  // Create tables and indexes
  for (const sql of postgresqlSchema.tables) {
    try {
      await conn.execute(sql);
    } catch (e) {
      // Ignore errors for triggers/functions that may already exist
      if (e instanceof Error && !e.message.includes('already exists')) {
        console.warn('[DB] Warning during schema creation:', e.message);
      }
    }
  }
}

// Synchronous rotateRuntimeSecrets for backward compatibility
export function rotateRuntimeSecrets(): void {
  try {
    const conn = getDb();
    const jwtRuntimeSecret = crypto.randomBytes(32).toString('hex');

    if (conn.type === 'sqlite') {
      const sqliteConn = conn as SQLiteConnection;
      sqliteConn.exec('DELETE FROM runtime_secrets');
      const stmt = sqliteConn.prepare('INSERT INTO runtime_secrets (key, value) VALUES (?, ?)');
      stmt.run('jwt_runtime', jwtRuntimeSecret);
    }

    console.log('[DB] Runtime secrets rotated');
  } catch (e) {
    console.error('[DB] Error rotating runtime secrets:', e);
  }
}

// Async rotateRuntimeSecrets for all database types
export async function rotateRuntimeSecretsAsync(conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<void> }): Promise<void> {
  try {
    const jwtRuntimeSecret = crypto.randomBytes(32).toString('hex');

    if (conn.type === 'sqlite') {
      const sqliteConn = conn as SQLiteConnection;
      sqliteConn.exec('DELETE FROM runtime_secrets');
      const stmt = sqliteConn.prepare('INSERT INTO runtime_secrets (key, value) VALUES (?, ?)');
      stmt.run('jwt_runtime', jwtRuntimeSecret);
    } else if (conn.type === 'mysql') {
      await (conn as { execute: (sql: string, params?: unknown[]) => Promise<void> }).execute('DELETE FROM runtime_secrets');
      await (conn as { execute: (sql: string, params?: unknown[]) => Promise<void> }).execute('INSERT INTO runtime_secrets (`key`, `value`) VALUES (?, ?)', ['jwt_runtime', jwtRuntimeSecret]);
    } else if (conn.type === 'postgresql') {
      await (conn as { execute: (sql: string, params?: unknown[]) => Promise<void> }).execute('DELETE FROM runtime_secrets');
      await (conn as { execute: (sql: string, params?: unknown[]) => Promise<void> }).execute('INSERT INTO runtime_secrets (key, value) VALUES ($1, $2)', ['jwt_runtime', jwtRuntimeSecret]);
    }

    console.log('[DB] Runtime secrets rotated');
  } catch (e) {
    console.error('[DB] Error rotating runtime secrets:', e);
  }
}

export function getRuntimeSecret(key: string): string | null {
  try {
    const conn = getDb();

    if (conn.type === 'sqlite') {
      const sqliteConn = conn as SQLiteConnection;
      const result = sqliteConn.prepare('SELECT value FROM runtime_secrets WHERE key = ?').get(key) as { value: string } | undefined;
      return result?.value || null;
    }

    return null;
  } catch (e) {
    return null;
  }
}
