import { SchemaDefinition } from './index';

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
      description TEXT NOT NULL DEFAULT '',
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
      config JSON NOT NULL DEFAULT ('{}'),
      remark TEXT NOT NULL DEFAULT '',
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
      remark TEXT NOT NULL DEFAULT '',
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
      data JSON NOT NULL DEFAULT ('{}'),
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
      key VARCHAR(255) PRIMARY KEY,
      value TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS user_2fa (
      user_id INT NOT NULL,
      type VARCHAR(50) NOT NULL,
      secret VARCHAR(255) NOT NULL,
      enabled TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_type (user_id, type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id VARCHAR(255) PRIMARY KEY,
      user_id INT NOT NULL,
      public_key TEXT NOT NULL,
      counter INT NOT NULL DEFAULT 0,
      device_type VARCHAR(50) NOT NULL DEFAULT '',
      backed_up TINYINT NOT NULL DEFAULT 0,
      transports JSON NOT NULL DEFAULT '[]',
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
      ip VARCHAR(45) NOT NULL,
      user_agent TEXT,
      success TINYINT NOT NULL DEFAULT 0,
      fail_reason VARCHAR(255),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_identifier (identifier),
      INDEX idx_ip (ip),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  ],
  createIndexes: [
    // 索引已在 CREATE TABLE 中定义
  ],
  alterTables: [
    // MySQL 支持 ALTER TABLE，可以在这里添加迁移脚本
  ],
};
