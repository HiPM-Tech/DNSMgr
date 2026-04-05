import { SchemaDefinition } from './index';

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
    `CREATE TRIGGER IF NOT EXISTS update_users_updated_at
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
  ],
  createIndexes: [
    // 索引已在 CREATE TABLE 中定义
  ],
  alterTables: [
    // PostgreSQL 支持 ALTER TABLE，可以在这里添加迁移脚本
  ],
};
