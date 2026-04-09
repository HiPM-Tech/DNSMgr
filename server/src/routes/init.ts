import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import { Pool } from 'pg';
import { initSchema, initSchemaAsync, rotateRuntimeSecretsAsync } from '../db/schema';
import { saveEnvConfig, getDbConfig } from '../config/env';
import { createConnection, isDbInitialized, hasUsers, getDb, getCurrentConnection } from '../db/database';
import { log } from '../lib/logger';

const router = Router();

// Check system initialization status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const dbInitialized = await isDbInitialized();
    const hasAnyUsers = await hasUsers();
    
    res.json({
      code: 0,
      data: {
        initialized: dbInitialized && hasAnyUsers,
        dbInitialized,
        hasUsers: hasAnyUsers,
      },
      msg: 'success',
    });
  } catch (error) {
    // If database is not connected yet
    res.json({
      code: 0,
      data: {
        initialized: false,
        dbInitialized: false,
        hasUsers: false,
      },
      msg: 'success',
    });
  }
});

// Test database connection and check for existing data
router.post('/test-db', async (req: Request, res: Response) => {
  const { type, sqlite, mysql: mysqlConfig, postgresql: pgConfig } = req.body;
  
  if (!type || !['sqlite', 'mysql', 'postgresql'].includes(type)) {
    return res.status(400).json({ code: 400, msg: 'Invalid database type' });
  }
  
  try {
    if (type === 'sqlite') {
      const sqlitePath = sqlite?.path || './data/dnsmgr.db';
      const fs = require('fs');
      const path = require('path');
      const dir = path.dirname(sqlitePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const testDb = new Database(sqlitePath);
      
      // Check if tables exist
      let hasData = false;
      try {
        const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
        if (tables.length > 0) {
          // Check if there's any data
          const firstTable = tables[0]?.name;
          if (firstTable) {
            const count = testDb.prepare(`SELECT COUNT(*) as cnt FROM "${firstTable}"`).get() as { cnt: number };
            hasData = count?.cnt > 0;
          }
        }
      } catch {
        // No tables yet
      }
      
      testDb.close();
      return res.json({ 
        code: 0, 
        data: { 
          success: true, 
          message: 'SQLite connection successful',
          hasExistingData: hasData
        }, 
        msg: 'success' 
      });
    }
    
    if (type === 'mysql') {
      if (!mysqlConfig) {
        return res.status(400).json({ code: 400, msg: 'MySQL configuration required' });
      }
      const pool = mysql.createPool({
        host: mysqlConfig.host,
        port: mysqlConfig.port || 3306,
        user: mysqlConfig.user,
        password: mysqlConfig.password,
        database: mysqlConfig.database,
        ssl: mysqlConfig.ssl ? { rejectUnauthorized: false } : undefined,
        connectionLimit: 1,
      });

      // Verify the connection is actually reachable before proceeding
      const conn = await pool.getConnection();
      conn.release();

      // Check if there's any data
      let hasData = false;
      try {
        const [tables] = await pool.execute<any[]>('SHOW TABLES');
        if (tables && tables.length > 0) {
          const firstTable = Object.values(tables[0])[0] as string;
          if (firstTable) {
            const [countResult] = await pool.execute<any[]>(`SELECT COUNT(*) as cnt FROM \`${firstTable}\``);
            const count = countResult[0]?.cnt || 0;
            hasData = count > 0;
          }
        }
      } catch {
        // No tables yet
      }
      
      await pool.end();
      return res.json({ 
        code: 0, 
        data: { 
          success: true, 
          message: 'MySQL connection successful',
          hasExistingData: hasData
        }, 
        msg: 'success' 
      });
    }
    
    if (type === 'postgresql') {
      if (!pgConfig) {
        return res.status(400).json({ code: 400, msg: 'PostgreSQL configuration required' });
      }
      const pool = new Pool({
        host: pgConfig.host,
        port: pgConfig.port || 5432,
        user: pgConfig.user,
        password: pgConfig.password,
        database: pgConfig.database,
        ssl: pgConfig.ssl ? { rejectUnauthorized: false } : false,
        max: 1,
      });

      // Verify the connection is actually reachable before proceeding
      const client = await pool.connect();
      client.release();

      // Check if there's any data
      let hasData = false;
      try {
        const tablesResult = await pool.query(`
          SELECT table_name FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        `);
        const tables = tablesResult.rows as { table_name: string }[];
        if (tables && tables.length > 0) {
          const firstTable = tables[0]?.table_name;
          if (firstTable) {
            const countResult = await pool.query(`SELECT COUNT(*) as cnt FROM "${firstTable}"`);
            const count = countResult.rows[0]?.cnt || 0;
            hasData = count > 0;
          }
        }
      } catch {
        // No tables yet
      }
      
      await pool.end();
      return res.json({ 
        code: 0, 
        data: { 
          success: true, 
          message: 'PostgreSQL connection successful',
          hasExistingData: hasData
        }, 
        msg: 'success' 
      });
    }
  } catch (error) {
    return res.status(400).json({ 
      code: 400, 
      data: { success: false, message: error instanceof Error ? error.message : 'Connection failed' },
      msg: error instanceof Error ? error.message : 'Connection failed'
    });
  }
});

// Initialize database
router.post('/database', async (req: Request, res: Response) => {
  const { type, sqlite, mysql: mysqlConfig, postgresql: pgConfig, reset = false } = req.body;

  const systemReady = await isDbInitialized() && await hasUsers();
  if (systemReady) {
    return res.status(403).json({
      code: 403,
      msg: 'System is already initialized. Database re-initialization is not allowed via public init endpoint.',
    });
  }
  
  if (!type || !['sqlite', 'mysql', 'postgresql'].includes(type)) {
    return res.status(400).json({ code: 400, msg: 'Invalid database type' });
  }
  
  try {
    // Save configuration to data/.env
    const envConfig: Record<string, string> = {
      DB_TYPE: type,
    };

    // Generate a random base JWT secret during initialization when missing
    // (or still using insecure default).
    const currentJwtSecret = process.env.JWT_SECRET || '';
    if (!currentJwtSecret || currentJwtSecret === 'dnsmgr-secret-key') {
      envConfig.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    }
    
    if (type === 'sqlite') {
      envConfig.DB_PATH = sqlite?.path || './data/dnsmgr.db';
    } else if (type === 'mysql') {
      envConfig.DB_HOST = mysqlConfig.host;
      envConfig.DB_PORT = String(mysqlConfig.port || 3306);
      envConfig.DB_NAME = mysqlConfig.database;
      envConfig.DB_USER = mysqlConfig.user;
      envConfig.DB_PASSWORD = mysqlConfig.password;
      envConfig.DB_SSL = mysqlConfig.ssl ? 'true' : 'false';
    } else if (type === 'postgresql') {
      envConfig.DB_HOST = pgConfig.host;
      envConfig.DB_PORT = String(pgConfig.port || 5432);
      envConfig.DB_NAME = pgConfig.database;
      envConfig.DB_USER = pgConfig.user;
      envConfig.DB_PASSWORD = pgConfig.password;
      envConfig.DB_SSL = pgConfig.ssl ? 'true' : 'false';
    }
    
    saveEnvConfig(envConfig);
    
    // Create database connection
    const conn = await createConnection();
    
    // Initialize schema (use async version for all database types)
    // If reset is true, drop existing tables first
    if (reset) {
      await initSchemaAsync(conn, true);
    } else {
      await initSchemaAsync(conn, false);
    }
    
    res.json({
      code: 0,
      data: { success: true, reset },
      msg: reset ? 'Database reset successfully' : 'Database initialized successfully',
    });
  } catch (error) {
    log.error('Init', 'Database initialization error', { error });
    res.status(500).json({
      code: 500,
      msg: error instanceof Error ? error.message : 'Failed to initialize database',
    });
  }
});

// Create admin user
router.post('/admin', async (req: Request, res: Response) => {
  // Check if database is initialized
  const dbInitialized = await isDbInitialized();
  if (!dbInitialized) {
    return res.status(400).json({ code: 400, msg: 'Database not initialized. Please initialize database first.' });
  }
  
  // Check if already initialized
  const hasAnyUsers = await hasUsers();
  if (hasAnyUsers) {
    return res.status(400).json({ code: 400, msg: 'Admin user already exists' });
  }
  
  const { username, email, password } = req.body;
  
  // Validate required fields
  if (!username || !email || !password) {
    return res.status(400).json({ code: 400, msg: 'Username, email and password are required' });
  }
  
  // Validate username format
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ code: 400, msg: 'Username must be 3-20 characters, alphanumeric and underscore only' });
  }
  
  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ code: 400, msg: 'Invalid email format' });
  }
  
  // Validate password length
  if (password.length < 6) {
    return res.status(400).json({ code: 400, msg: 'Password must be at least 6 characters' });
  }
  
  try {
    const conn = getCurrentConnection();
    if (!conn) {
      return res.status(500).json({ code: 500, msg: 'Database connection not available' });
    }
    
    const hash = bcrypt.hashSync(password, 10);
    
    // Use appropriate parameter placeholders based on database type
    const placeholders = conn.type === 'postgresql' 
      ? '$1, $2, $3, $4, $5, $6, $7' 
      : '?, ?, ?, ?, ?, ?, ?';
    
    await conn.execute(
      `INSERT INTO users (username, nickname, email, password_hash, role, role_level, status) VALUES (${placeholders})`,
      [username, username, email, hash, 'admin', 3, 1]
    );
    
    // Rotate runtime secrets
    await rotateRuntimeSecretsAsync(conn);
    
    res.json({
      code: 0,
      data: { success: true },
      msg: 'Admin user created successfully',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error instanceof Error ? error.message : 'Failed to create admin user',
    });
  }
});

export default router;
