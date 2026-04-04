import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/dnsmgr.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

// Check if database is initialized (has tables)
export function isDbInitialized(): boolean {
  try {
    const db = getDb();
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    return !!result;
  } catch {
    return false;
  }
}

// Check if any user exists
export function hasUsers(): boolean {
  try {
    const db = getDb();
    const result = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
    return result.cnt > 0;
  } catch {
    return false;
  }
}

// Test database connection with config
export async function testDatabaseConnection(config: {
  type: 'sqlite' | 'mysql' | 'postgresql';
  sqlite?: { path: string };
  mysql?: { host: string; port: number; database: string; user: string; password: string; ssl?: boolean };
  postgresql?: { host: string; port: number; database: string; user: string; password: string; ssl?: boolean };
}): Promise<{ success: boolean; message: string }> {
  try {
    if (config.type === 'sqlite') {
      const sqlitePath = config.sqlite?.path || './data/dnsmgr.db';
      const dir = path.dirname(sqlitePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const testDb = new Database(sqlitePath);
      testDb.prepare('SELECT 1').get();
      testDb.close();
      return { success: true, message: 'SQLite connection successful' };
    }
    
    // For MySQL and PostgreSQL, we would need to implement actual connection tests
    // This is a placeholder for now
    return { success: true, message: `${config.type} connection test passed (placeholder)` };
  } catch (error) {
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
