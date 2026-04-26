import { SchemaDefinition } from './index';

/**
 * MySQL 数据库禁忌事项 / MySQL Database Restrictions:
 *
 * 1. TEXT/BLOB/JSON/GEOMETRY 类型列不能有默认值
 *    - 错误: ER_BLOB_CANT_HAVE_DEFAULT (errno 1101)
 *    - 解决: 使用 NULL 或 VARCHAR 替代，或在应用层处理默认值
 *
 * 2. 不支持 ALTER TABLE ADD COLUMN IF NOT EXISTS
 *    - 需要使用存储过程或应用层检查
 *
 * 3. ENUM 类型修改需要重建表
 *    - 不能直接添加新的 ENUM 值
 *
 * 4. CHECK 约束在 MySQL 8.0.16+ 才生效
 *    - 旧版本会解析但不强制执行
 *
 * 5. 存储过程在预处理语句协议中不受支持
 *    - 错误: ER_UNSUPPORTED_PS (errno 1295)
 */

export const mysqlSchema: SchemaDefinition = {
  createTables: [
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
      role ENUM('owner', 'admin', 'member') NOT NULL DEFAULT 'member',
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
      apex_expires_at DATETIME,
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
    `CREATE TABLE IF NOT EXISTS oauth_states (
      state VARCHAR(255) PRIMARY KEY,
      mode VARCHAR(20) NOT NULL CHECK(mode IN ('login', 'bind')),
      provider VARCHAR(100) NOT NULL,
      user_id INT,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_oauth_state_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE IF NOT EXISTS runtime_secrets (
      \`key\` VARCHAR(255) PRIMARY KEY,
      \`value\` TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS user_2fa (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
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
      token VARCHAR(255) NOT NULL UNIQUE,
      user_agent TEXT,
      ip VARCHAR(45) NOT NULL DEFAULT '',
      last_active_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_token (token),
      INDEX idx_user_id (user_id),
      INDEX idx_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS login_attempts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      identifier VARCHAR(255) NOT NULL,
      ip_address VARCHAR(255) NOT NULL DEFAULT '',
      attempt_count INT NOT NULL DEFAULT 1,
      last_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      locked_until DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_identifier (identifier),
      INDEX idx_ip_address (ip_address),
      INDEX idx_locked_until (locked_until)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS system_settings (
      \`key\` VARCHAR(255) PRIMARY KEY,
      \`value\` TEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS user_preferences (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      theme VARCHAR(50) NOT NULL DEFAULT 'auto' CHECK(theme IN ('light', 'dark', 'auto')),
      language VARCHAR(50) NOT NULL DEFAULT 'zh-CN',
      notifications_enabled TINYINT NOT NULL DEFAULT 1,
      email_notifications TINYINT NOT NULL DEFAULT 1,
      background_image TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS user_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      token_hash VARCHAR(255) NOT NULL UNIQUE,
      allowed_domains JSON,
      allowed_services JSON,
      start_time DATETIME,
      end_time DATETIME,
      max_role INT NOT NULL DEFAULT 1,
      is_active TINYINT NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_token_hash (token_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS failover_configs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      domain_id INT NOT NULL,
      record_id INT NOT NULL,
      record_type VARCHAR(50) NOT NULL,
      record_name VARCHAR(255) NOT NULL,
      primary_value VARCHAR(255) NOT NULL,
      backup_value VARCHAR(255) NOT NULL,
      check_interval INT NOT NULL DEFAULT 60,
      check_timeout INT NOT NULL DEFAULT 5,
      check_method VARCHAR(50) NOT NULL DEFAULT 'ping',
      check_port INT,
      check_path VARCHAR(255),
      check_expect VARCHAR(255),
      enabled TINYINT NOT NULL DEFAULT 1,
      created_by INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id),
      INDEX idx_domain_id (domain_id),
      INDEX idx_enabled (enabled)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS failover_status (
      id INT AUTO_INCREMENT PRIMARY KEY,
      config_id INT NOT NULL,
      current_value VARCHAR(255) NOT NULL,
      status ENUM('primary', 'backup', 'unknown') NOT NULL DEFAULT 'primary',
      last_check_at DATETIME,
      last_failover_at DATETIME,
      fail_count INT NOT NULL DEFAULT 0,
      success_count INT NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (config_id) REFERENCES failover_configs(id) ON DELETE CASCADE,
      UNIQUE KEY unique_config (config_id),
      INDEX idx_config_id (config_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS security_policies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      require_2fa_global TINYINT NOT NULL DEFAULT 0,
      min_password_length INT NOT NULL DEFAULT 8,
      min_password_strength INT NOT NULL DEFAULT 2,
      session_timeout_hours INT NOT NULL DEFAULT 24,
      max_login_attempts INT NOT NULL DEFAULT 5,
      lockout_duration_minutes INT NOT NULL DEFAULT 30,
      allow_remember_device TINYINT NOT NULL DEFAULT 1,
      trusted_device_days INT NOT NULL DEFAULT 30,
      require_password_change_on_first_login TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS user_security_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      require_2fa TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS user_totp (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      secret TEXT NOT NULL,
      backup_codes TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS user_webauthn_credentials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      credential_id TEXT NOT NULL,
      public_key TEXT NOT NULL,
      counter INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS trusted_devices (
      id VARCHAR(255) PRIMARY KEY,
      user_id INT NOT NULL,
      device_name VARCHAR(255) NOT NULL,
      device_fingerprint VARCHAR(255) NOT NULL,
      user_agent TEXT,
      ip_address VARCHAR(255),
      last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_fingerprint (device_fingerprint)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS ns_monitor_configs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      domain_id INT NOT NULL,
      expected_ns TEXT NOT NULL,
      enabled TINYINT NOT NULL DEFAULT 0,
      notify_email TINYINT NOT NULL DEFAULT 1,
      notify_channels TINYINT NOT NULL DEFAULT 1,
      check_interval INT NOT NULL DEFAULT 3600,
      created_by INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id),
      INDEX idx_domain_id (domain_id),
      INDEX idx_enabled (enabled)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS ns_monitor_status (
      id INT AUTO_INCREMENT PRIMARY KEY,
      config_id INT NOT NULL UNIQUE,
      current_ns TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'ok',
      last_check_at DATETIME,
      last_alert_at DATETIME,
      alert_count INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (config_id) REFERENCES ns_monitor_configs(id) ON DELETE CASCADE,
      INDEX idx_config_id (config_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS ns_monitor_alerts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      config_id INT NOT NULL,
      alert_type VARCHAR(20) NOT NULL,
      expected_ns TEXT NOT NULL,
      actual_ns TEXT NOT NULL,
      sent_email TINYINT NOT NULL DEFAULT 0,
      sent_channels TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (config_id) REFERENCES ns_monitor_configs(id) ON DELETE CASCADE,
      INDEX idx_config_id (config_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS user_ns_monitor_prefs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      notify_email TINYINT NOT NULL DEFAULT 1,
      notify_channels TINYINT NOT NULL DEFAULT 1,
      check_interval INT NOT NULL DEFAULT 3600,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS ns_monitor_domains (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      domain_id INT NOT NULL,
      expected_ns TEXT,
      current_ns TEXT,
      encrypted_ns TEXT,
      plain_ns TEXT,
      is_poisoned TINYINT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'ok',
      enabled TINYINT NOT NULL DEFAULT 1,
      last_check_at DATETIME,
      last_alert_at DATETIME,
      alert_count INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_domain (user_id, domain_id),
      INDEX idx_user_id (user_id),
      INDEX idx_domain_id (domain_id),
      INDEX idx_enabled (enabled)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS rdap_server_cache (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tld VARCHAR(255) NOT NULL UNIQUE,
      servers TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS system_cache (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cache_key VARCHAR(255) NOT NULL UNIQUE,
      cache_value TEXT NOT NULL,
      expires_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  ],
  createIndexes: [
    // 索引已在 CREATE TABLE 中定义
  ],
  alterTables: [
    // Migration: Add 'admin' to team_members role enum
    // This modifies the existing ENUM to include 'admin' role
    `ALTER TABLE team_members MODIFY COLUMN role ENUM('owner', 'admin', 'member') NOT NULL DEFAULT 'member'`,
    // Note: apex_expires_at column is added via handleMySQLMigrations() in schema.ts
    // (stored procedures are not supported in prepared statement protocol)
    // Note: encrypted_ns, plain_ns, is_poisoned columns are added via addNsMonitorColumns() in schema.ts
    // (MySQL does not support IF NOT EXISTS syntax for ALTER TABLE ADD COLUMN)
  ],
};
