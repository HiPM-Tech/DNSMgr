import { getDb } from './database';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export function initSchema(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
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
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'member')),
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(team_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS dns_accounts (
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
    );

    CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      third_id TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      is_hidden INTEGER NOT NULL DEFAULT 0,
      record_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES dns_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS domain_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      team_id INTEGER,
      domain_id INTEGER NOT NULL,
      sub TEXT NOT NULL DEFAULT '',
      permission TEXT NOT NULL DEFAULT 'write' CHECK(permission IN ('read', 'write')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      domain TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS runtime_secrets (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const userColumns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const hasNickname = userColumns.some((col) => col.name === 'nickname');
  if (!hasNickname) {
    db.exec("ALTER TABLE users ADD COLUMN nickname TEXT NOT NULL DEFAULT ''");
    db.exec("UPDATE users SET nickname = username WHERE nickname = '' OR nickname IS NULL");
  }
  const hasRoleLevel = userColumns.some((col) => col.name === 'role_level');
  if (!hasRoleLevel) {
    db.exec('ALTER TABLE users ADD COLUMN role_level INTEGER NOT NULL DEFAULT 1');
    db.exec("UPDATE users SET role_level = CASE role WHEN 'admin' THEN 2 ELSE 1 END");
  }

  const permColumns = db.prepare("PRAGMA table_info(domain_permissions)").all() as { name: string }[];
  const hasPermission = permColumns.some((col) => col.name === 'permission');
  if (!hasPermission) {
    db.exec("ALTER TABLE domain_permissions ADD COLUMN permission TEXT NOT NULL DEFAULT 'write'");
  }

  // Normalize historical duplicate domains before creating a unique index.
  db.exec(`
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

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_account_name_unique
    ON domains(account_id, name);
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_permissions_unique
    ON domain_permissions(domain_id, user_id, team_id, sub);
  `);

  // Note: Default admin user creation is now handled via initialization wizard
  // The init API routes in /routes/init.ts handle admin user creation

  // Rotate runtime secrets on each startup to invalidate prior temporary keys.
  const jwtRuntimeSecret = crypto.randomBytes(32).toString('hex');
  db.exec('DELETE FROM runtime_secrets');
  db.prepare('INSERT INTO runtime_secrets (key, value) VALUES (?, ?)').run('jwt_runtime', jwtRuntimeSecret);
  console.log('[DB] Runtime secrets rotated');
}
