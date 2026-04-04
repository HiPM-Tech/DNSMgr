import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import { Pool } from 'pg';
import { initSchema, initSchemaAsync, rotateRuntimeSecretsAsync } from '../db/schema';
import { saveEnvConfig, getDbConfig } from '../config/env';
import { createConnection, isDbInitialized, hasUsers, getDb, getCurrentConnection } from '../db/database';

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

// Test database connection
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
      testDb.prepare('SELECT 1').get();
      testDb.close();
      return res.json({ code: 0, data: { success: true, message: 'SQLite connection successful' }, msg: 'success' });
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
      const [rows] = await pool.execute('SELECT 1');
      await pool.end();
      return res.json({ code: 0, data: { success: true, message: 'MySQL connection successful' }, msg: 'success' });
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
      const result = await pool.query('SELECT 1');
      await pool.end();
      return res.json({ code: 0, data: { success: true, message: 'PostgreSQL connection successful' }, msg: 'success' });
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
  const { type, sqlite, mysql: mysqlConfig, postgresql: pgConfig } = req.body;
  
  if (!type || !['sqlite', 'mysql', 'postgresql'].includes(type)) {
    return res.status(400).json({ code: 400, msg: 'Invalid database type' });
  }
  
  try {
    // Save configuration to data/.env
    const envConfig: Record<string, string> = {
      DB_TYPE: type,
    };
    
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
    await initSchemaAsync(conn);
    
    res.json({
      code: 0,
      data: { success: true },
      msg: 'Database initialized successfully',
    });
  } catch (error) {
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
