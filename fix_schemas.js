const fs = require('fs');
const path = require('path');

// Fix sqlite
let sqlite = fs.readFileSync('./server/src/db/schemas/sqlite.ts', 'utf8');
sqlite = sqlite.replace(/record_count INTEGER NOT NULL DEFAULT 0,/, "record_count INTEGER NOT NULL DEFAULT 0,\n      expires_at TEXT,");
if (!sqlite.includes('webauthn_credentials')) {
  sqlite = sqlite.replace(/\]\s*,\s*createIndexes:/, 
  `    \`CREATE TABLE IF NOT EXISTS user_2fa (
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      secret TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, type)
    )\`,
    \`CREATE TABLE IF NOT EXISTS webauthn_credentials (
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
    )\`,
    \`CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      user_agent TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )\`,
    \`CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL,
      ip TEXT NOT NULL,
      user_agent TEXT NOT NULL DEFAULT '',
      success INTEGER NOT NULL DEFAULT 0,
      fail_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )\`
  ],
  createIndexes:`);
}
fs.writeFileSync('./server/src/db/schemas/sqlite.ts', sqlite);

// Fix mysql
let mysql = fs.readFileSync('./server/src/db/schemas/mysql.ts', 'utf8');
mysql = mysql.replace(/record_count INT NOT NULL DEFAULT 0,/, "record_count INT NOT NULL DEFAULT 0,\n      expires_at DATETIME,");
if (!mysql.includes('webauthn_credentials')) {
  mysql = mysql.replace(/\]\s*,\s*createIndexes:/, 
  `    \`CREATE TABLE IF NOT EXISTS user_2fa (
      user_id INT NOT NULL,
      type VARCHAR(50) NOT NULL,
      secret VARCHAR(255) NOT NULL,
      enabled TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_type (user_id, type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\`,
    \`CREATE TABLE IF NOT EXISTS webauthn_credentials (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\`,
    \`CREATE TABLE IF NOT EXISTS user_sessions (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\`,
    \`CREATE TABLE IF NOT EXISTS login_attempts (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\`
  ],
  createIndexes:`);
}
fs.writeFileSync('./server/src/db/schemas/mysql.ts', mysql);

// Fix postgresql
let pg = fs.readFileSync('./server/src/db/schemas/postgresql.ts', 'utf8');
pg = pg.replace(/record_count INTEGER NOT NULL DEFAULT 0,/, "record_count INTEGER NOT NULL DEFAULT 0,\n      expires_at TIMESTAMP,");
if (!pg.includes('webauthn_credentials')) {
  pg = pg.replace(/\]\s*,\s*createIndexes:/, 
  `    \`CREATE TABLE IF NOT EXISTS user_2fa (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      secret VARCHAR(255) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, type)
    )\`,
    \`CREATE TABLE IF NOT EXISTS webauthn_credentials (
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
    )\`,
    \`CREATE TABLE IF NOT EXISTS user_sessions (
      id VARCHAR(255) PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) NOT NULL UNIQUE,
      user_agent TEXT NOT NULL DEFAULT '',
      ip VARCHAR(45) NOT NULL DEFAULT '',
      last_active_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )\`,
    \`CREATE TABLE IF NOT EXISTS login_attempts (
      id SERIAL PRIMARY KEY,
      identifier VARCHAR(255) NOT NULL,
      ip VARCHAR(45) NOT NULL,
      user_agent TEXT NOT NULL DEFAULT '',
      success BOOLEAN NOT NULL DEFAULT false,
      fail_reason VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )\`
  ],
  createIndexes:`);
}
fs.writeFileSync('./server/src/db/schemas/postgresql.ts', pg);
