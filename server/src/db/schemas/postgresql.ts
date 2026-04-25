import { SchemaDefinition } from './index';

/**
 * PostgreSQL 数据库禁忌事项 / PostgreSQL Database Restrictions:
 *
 * 1. 布尔类型使用 BOOLEAN，但需注意默认值
 *    - 支持 true/false 或 1/0
 *    - 推荐使用 true/false 更清晰
 *
 * 2. JSONB 类型索引需要 GIN 索引
 *    - 直接使用索引可能不生效
 *    - 需使用: CREATE INDEX idx ON table USING GIN (jsonb_column)
 *
 * 3. TEXT 类型可以有默认值
 *    - 与 MySQL 不同，PostgreSQL 支持 TEXT DEFAULT 'value'
 *
 * 4. 触发器函数需要单独创建
 *    - 使用 CREATE OR REPLACE FUNCTION
 *    - 然后在触发器中引用
 *
 * 5. ALTER TABLE ADD COLUMN IF NOT EXISTS 支持良好
 *    - 无需像 MySQL 那样使用存储过程
 *
 * 6. CHECK 约束在 8.0.16+ 才完全生效
 *    - 旧版本会解析但不强制执行
 *
 * 7. 外键约束默认会检查，但可通过 DEFERRABLE 延迟检查
 *    - 默认: NOT DEFERRABLE
 *    - 可选: DEFERRABLE INITIALLY DEFERRED
 *
 * 8. SERIAL 类型实际上是 INTEGER + sequence
 *    - 不能直接修改 SERIAL 列的默认值
 *    - 需要修改关联的 sequence
 */

export const postgresqlSchema: SchemaDefinition = {
  createTables: [
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
    `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at'
      ) THEN
        CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
      END IF;
    END $$`,
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
      role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
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
      apex_expires_at TIMESTAMP,
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
    `CREATE TABLE IF NOT EXISTS oauth_states (
      state VARCHAR(255) PRIMARY KEY,
      mode VARCHAR(20) NOT NULL CHECK(mode IN ('login', 'bind')),
      provider VARCHAR(100) NOT NULL,
      user_id INTEGER,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_oauth_state_expires ON oauth_states(expires_at)`,
`CREATE TABLE IF NOT EXISTS runtime_secrets (
      "key" VARCHAR(255) PRIMARY KEY,
      "value" TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_2fa (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL DEFAULT 'totp' CHECK(type IN ('totp', 'webauthn')),
      secret VARCHAR(255) NOT NULL,
      backup_codes JSONB NOT NULL DEFAULT '[]',
      enabled BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, type)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_2fa_user_id ON user_2fa(user_id)`,
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
    `CREATE TABLE IF NOT EXISTS user_sessions (
      id VARCHAR(255) PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) NOT NULL UNIQUE,
      user_agent TEXT NOT NULL DEFAULT '',
      ip VARCHAR(45) NOT NULL DEFAULT '',
      last_active_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
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
      "key" VARCHAR(255) PRIMARY KEY,
      "value" TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_preferences (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      theme VARCHAR(50) NOT NULL DEFAULT 'auto' CHECK(theme IN ('light', 'dark', 'auto')),
      language VARCHAR(50) NOT NULL DEFAULT 'zh-CN',
      notifications_enabled BOOLEAN NOT NULL DEFAULT true,
      email_notifications BOOLEAN NOT NULL DEFAULT true,
      background_image TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id)`,
    `CREATE TABLE IF NOT EXISTS user_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      token_hash VARCHAR(255) NOT NULL UNIQUE,
      allowed_domains JSONB NOT NULL DEFAULT '[]',
      allowed_services JSONB NOT NULL DEFAULT '[]',
      start_time TIMESTAMP,
      end_time TIMESTAMP,
      max_role INTEGER NOT NULL DEFAULT 1,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_tokens_user_id ON user_tokens(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_tokens_token_hash ON user_tokens(token_hash)`,
    `CREATE TABLE IF NOT EXISTS failover_configs (
      id SERIAL PRIMARY KEY,
      domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
      record_id INTEGER NOT NULL,
      record_type VARCHAR(50) NOT NULL,
      record_name VARCHAR(255) NOT NULL,
      primary_value VARCHAR(255) NOT NULL,
      backup_value VARCHAR(255) NOT NULL,
      check_interval INTEGER NOT NULL DEFAULT 60,
      check_timeout INTEGER NOT NULL DEFAULT 5,
      check_method VARCHAR(50) NOT NULL DEFAULT 'ping',
      check_port INTEGER,
      check_path VARCHAR(255),
      check_expect VARCHAR(255),
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_failover_configs_domain_id ON failover_configs(domain_id)`,
    `CREATE INDEX IF NOT EXISTS idx_failover_configs_enabled ON failover_configs(enabled)`,
    `CREATE TABLE IF NOT EXISTS failover_status (
      id SERIAL PRIMARY KEY,
      config_id INTEGER NOT NULL UNIQUE REFERENCES failover_configs(id) ON DELETE CASCADE,
      current_value VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'primary' CHECK (status IN ('primary', 'backup', 'unknown')),
      last_check_at TIMESTAMP,
      last_failover_at TIMESTAMP,
      fail_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_failover_status_config_id ON failover_status(config_id)`,
    `CREATE TABLE IF NOT EXISTS security_policies (
      id SERIAL PRIMARY KEY,
      require_2fa_global BOOLEAN NOT NULL DEFAULT false,
      min_password_length INTEGER NOT NULL DEFAULT 8,
      min_password_strength INTEGER NOT NULL DEFAULT 2,
      session_timeout_hours INTEGER NOT NULL DEFAULT 24,
      max_login_attempts INTEGER NOT NULL DEFAULT 5,
      lockout_duration_minutes INTEGER NOT NULL DEFAULT 30,
      allow_remember_device BOOLEAN NOT NULL DEFAULT true,
      trusted_device_days INTEGER NOT NULL DEFAULT 30,
      require_password_change_on_first_login BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_security_settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      require_2fa BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_security_settings_user_id ON user_security_settings(user_id)`,
    `CREATE TABLE IF NOT EXISTS user_totp (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      secret TEXT NOT NULL,
      backup_codes TEXT NOT NULL DEFAULT '[]',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_totp_user_id ON user_totp(user_id)`,
    `CREATE TABLE IF NOT EXISTS user_webauthn_credentials (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_webauthn_credentials_user_id ON user_webauthn_credentials(user_id)`,
    `CREATE TABLE IF NOT EXISTS trusted_devices (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_name TEXT NOT NULL,
      device_fingerprint TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      last_used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_id ON trusted_devices(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_trusted_devices_fingerprint ON trusted_devices(device_fingerprint)`,
    `CREATE TABLE IF NOT EXISTS ns_monitor_configs (
      id SERIAL PRIMARY KEY,
      domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
      expected_ns TEXT NOT NULL DEFAULT '',
      enabled BOOLEAN NOT NULL DEFAULT false,
      notify_email BOOLEAN NOT NULL DEFAULT true,
      notify_channels BOOLEAN NOT NULL DEFAULT true,
      check_interval INTEGER NOT NULL DEFAULT 3600,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ns_monitor_configs_domain_id ON ns_monitor_configs(domain_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ns_monitor_configs_enabled ON ns_monitor_configs(enabled)`,
    `CREATE TABLE IF NOT EXISTS ns_monitor_status (
      id SERIAL PRIMARY KEY,
      config_id INTEGER NOT NULL UNIQUE REFERENCES ns_monitor_configs(id) ON DELETE CASCADE,
      current_ns TEXT NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'ok' CHECK(status IN ('ok', 'mismatch', 'missing')),
      last_check_at TIMESTAMP,
      last_alert_at TIMESTAMP,
      alert_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ns_monitor_status_config_id ON ns_monitor_status(config_id)`,
    `CREATE TABLE IF NOT EXISTS ns_monitor_alerts (
      id SERIAL PRIMARY KEY,
      config_id INTEGER NOT NULL REFERENCES ns_monitor_configs(id) ON DELETE CASCADE,
      alert_type VARCHAR(20) NOT NULL CHECK(alert_type IN ('mismatch', 'missing')),
      expected_ns TEXT NOT NULL DEFAULT '',
      actual_ns TEXT NOT NULL DEFAULT '',
      sent_email BOOLEAN NOT NULL DEFAULT false,
      sent_channels BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ns_monitor_alerts_config_id ON ns_monitor_alerts(config_id)`,
    `CREATE TABLE IF NOT EXISTS user_ns_monitor_prefs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      notify_email BOOLEAN NOT NULL DEFAULT true,
      notify_channels BOOLEAN NOT NULL DEFAULT true,
      check_interval INTEGER NOT NULL DEFAULT 3600,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_ns_monitor_prefs_user_id ON user_ns_monitor_prefs(user_id)`,
    `CREATE TABLE IF NOT EXISTS ns_monitor_domains (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
      expected_ns TEXT NOT NULL DEFAULT '',
      current_ns TEXT NOT NULL DEFAULT '',
      encrypted_ns TEXT,
      plain_ns TEXT,
      is_poisoned BOOLEAN NOT NULL DEFAULT false,
      status VARCHAR(20) NOT NULL DEFAULT 'ok' CHECK(status IN ('ok', 'mismatch', 'missing', 'poisoned')),
      enabled BOOLEAN NOT NULL DEFAULT true,
      last_check_at TIMESTAMP,
      last_alert_at TIMESTAMP,
      alert_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, domain_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ns_monitor_domains_user_id ON ns_monitor_domains(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ns_monitor_domains_domain_id ON ns_monitor_domains(domain_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ns_monitor_domains_enabled ON ns_monitor_domains(enabled)`
  ],
  createIndexes: [
    // 索引已在 CREATE TABLE 中定义
  ],
  alterTables: [
    // Migration: Add 'admin' to team_members role check constraint
    // First drop the existing constraint, then add the new one
    `ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check`,
    `ALTER TABLE team_members ADD CONSTRAINT team_members_role_check CHECK (role IN ('owner', 'admin', 'member'))`,
    // Migration: Add apex_expires_at column to domains table for subdomain expiry tracking
    `ALTER TABLE domains ADD COLUMN IF NOT EXISTS apex_expires_at TIMESTAMP`,
    // Migration: Add encrypted_ns, plain_ns, is_poisoned columns to ns_monitor_domains for DNS pollution detection
    `ALTER TABLE ns_monitor_domains ADD COLUMN IF NOT EXISTS encrypted_ns TEXT`,
    `ALTER TABLE ns_monitor_domains ADD COLUMN IF NOT EXISTS plain_ns TEXT`,
    `ALTER TABLE ns_monitor_domains ADD COLUMN IF NOT EXISTS is_poisoned BOOLEAN NOT NULL DEFAULT false`,
    // Migration: Update status check constraint to include 'poisoned'
    `ALTER TABLE ns_monitor_domains DROP CONSTRAINT IF EXISTS ns_monitor_domains_status_check`,
    `ALTER TABLE ns_monitor_domains ADD CONSTRAINT ns_monitor_domains_status_check CHECK (status IN ('ok', 'mismatch', 'missing', 'poisoned'))`
  ],
};
