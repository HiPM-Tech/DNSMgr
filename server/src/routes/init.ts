import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { initSchema, initSchemaAsync } from '../db/schema';
import { saveEnvConfig, getDbConfig } from '../config/env';
import { createConnection, isDbInitialized, hasUsers } from '../db/connection';
import { connect } from '../db/core/connection';
import type { DatabaseConfig } from '../db/core/config';
import { UserOperations, SystemOperations, SecretOperations } from '../db/business-adapter';
import { log } from '../lib/logger';

// ============================================================================
// 初始化专用数据库连接函数（隔离、防污染）
// ============================================================================

/**
 * 构建数据库配置对象
 */
function buildDbConfig(
  type: 'sqlite' | 'mysql' | 'postgresql',
  sqlite?: { path: string },
  mysqlConfig?: { host: string; port: number; database: string; user: string; password: string; ssl?: boolean },
  pgConfig?: { host: string; port: number; database: string; user: string; password: string; ssl?: boolean }
): DatabaseConfig {
  const dbConfig: DatabaseConfig = {
    type,
    logging: process.env.DB_LOGGING !== 'false',
    slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD || '100', 10),
  };

  if (type === 'sqlite') {
    let dbPath = sqlite?.path || './data/dnsmgr.db';
    dbPath = dbPath.replace(/\\/g, '/');
    dbConfig.sqlite = {
      path: dbPath,
      mode: 'readwrite',
      busyTimeout: 5000,
      enableWAL: true,
      foreignKeys: true,
    };
  } else if (type === 'mysql' && mysqlConfig) {
    dbConfig.mysql = {
      host: mysqlConfig.host,
      port: mysqlConfig.port || 3306,
      database: mysqlConfig.database,
      user: mysqlConfig.user,
      password: mysqlConfig.password,
      ssl: mysqlConfig.ssl,
      connectionLimit: 20,
      connectTimeout: 60000,
      acquireTimeout: 60000,
      timeout: 60000,
    };
  } else if (type === 'postgresql' && pgConfig) {
    dbConfig.postgresql = {
      host: pgConfig.host,
      port: pgConfig.port || 5432,
      database: pgConfig.database,
      user: pgConfig.user,
      password: pgConfig.password,
      ssl: pgConfig.ssl,
      poolSize: 20,
      connectionTimeoutMillis: 60000,
      idleTimeoutMillis: 30000,
    };
  }

  return dbConfig;
}

/**
 * 保存数据库配置到环境变量
 */
function saveDatabaseConfig(
  type: 'sqlite' | 'mysql' | 'postgresql',
  sqlite?: { path: string },
  mysqlConfig?: { host: string; port: number; database: string; user: string; password: string; ssl?: boolean },
  pgConfig?: { host: string; port: number; database: string; user: string; password: string; ssl?: boolean }
): void {
  const envConfig: Record<string, string> = {
    DB_TYPE: type,
  };

  if (type === 'sqlite') {
    let dbPath = sqlite?.path || './data/dnsmgr.db';
    dbPath = dbPath.replace(/\\/g, '/');
    envConfig.DB_PATH = dbPath;
  } else if (type === 'mysql' && mysqlConfig) {
    envConfig.DB_HOST = mysqlConfig.host;
    envConfig.DB_PORT = String(mysqlConfig.port || 3306);
    envConfig.DB_NAME = mysqlConfig.database;
    envConfig.DB_USER = mysqlConfig.user;
    envConfig.DB_PASSWORD = mysqlConfig.password;
    envConfig.DB_SSL = mysqlConfig.ssl ? 'true' : 'false';
  } else if (type === 'postgresql' && pgConfig) {
    envConfig.DB_HOST = pgConfig.host;
    envConfig.DB_PORT = String(pgConfig.port || 5432);
    envConfig.DB_NAME = pgConfig.database;
    envConfig.DB_USER = pgConfig.user;
    envConfig.DB_PASSWORD = pgConfig.password;
    envConfig.DB_SSL = pgConfig.ssl ? 'true' : 'false';
  }

  saveEnvConfig(envConfig);
  log.info('Init', 'Database configuration saved', { type });
}

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
      
      const result = await SystemOperations.testSqliteConnection(sqlitePath);
      return res.json({ 
        code: 0, 
        data: result, 
        msg: 'success' 
      });
    }
    
    if (type === 'mysql') {
      if (!mysqlConfig) {
        return res.status(400).json({ code: 400, msg: 'MySQL configuration required' });
      }
      
      const result = await SystemOperations.testMysqlConnection(mysqlConfig);
      return res.json({ 
        code: 0, 
        data: result, 
        msg: 'success' 
      });
    }
    
    if (type === 'postgresql') {
      if (!pgConfig) {
        return res.status(400).json({ code: 400, msg: 'PostgreSQL configuration required' });
      }
      
      const result = await SystemOperations.testPostgresqlConnection(pgConfig);
      return res.json({ 
        code: 0, 
        data: result, 
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

  if (!type || !['sqlite', 'mysql', 'postgresql'].includes(type)) {
    return res.status(400).json({ code: 400, msg: 'Invalid database type' });
  }

  // Step 1: Test connection and check for existing data
  const testConfig = buildDbConfig(type, sqlite, mysqlConfig, pgConfig);
  let hasExistingData = false;
  let hasExistingUsers = false;
  
  try {
    const testResult = await SystemOperations.testConnection({
      type,
      sqlite: sqlite || { path: './data/dnsmgr.db' },
      mysql: mysqlConfig,
      postgresql: pgConfig,
    });
    hasExistingData = testResult.hasExistingData;
    hasExistingUsers = testResult.hasUsers || false;
    log.info('Init', 'Test connection result', { hasExistingData, hasExistingUsers, type });
  } catch (error) {
    log.debug('Init', 'No existing database connection or no data found', { error });
  }

  // Step 2: Handle different scenarios based on existing data
  
  // Scenario A: Has existing users and keeping data -> Skip to complete
  if (hasExistingData && hasExistingUsers && !reset) {
    try {
      // Save config first
      saveDatabaseConfig(type, sqlite, mysqlConfig, pgConfig);
      
      // Disconnect any existing connection
      try {
        const { disconnect } = await import('../db/core/connection');
        await disconnect();
      } catch { /* Ignore */ }
      
      // Establish new connection with explicit config
      await connect(testConfig);
      log.info('Init', 'Connected to existing database with users, skipping to complete');
      
      return res.json({
        code: 0,
        data: { 
          success: true, 
          skipToComplete: true,
          message: 'Database already initialized with users. Setup complete.'
        },
        msg: 'Database already initialized with users. Setup complete.',
      });
    } catch (error) {
      log.error('Init', 'Failed to connect to existing database', { error });
      return res.status(500).json({
        code: 500,
        msg: 'Failed to connect to existing database. Please check your configuration.',
      });
    }
  }
  
  // Scenario B: Has existing data but no users, keeping data -> Skip to user creation
  if (hasExistingData && !hasExistingUsers && !reset) {
    try {
      // Save config first
      saveDatabaseConfig(type, sqlite, mysqlConfig, pgConfig);
      
      // Disconnect any existing connection
      try {
        const { disconnect } = await import('../db/core/connection');
        await disconnect();
      } catch { /* Ignore */ }
      
      // Establish new connection with explicit config
      await connect(testConfig);
      log.info('Init', 'Connected to existing database without users, skipping to user creation');
      
      return res.json({
        code: 0,
        data: { 
          success: true, 
          skipToUserCreation: true,
          message: 'Database already initialized. Proceed to create admin user.'
        },
        msg: 'Database already initialized. Please create admin user.',
      });
    } catch (error) {
      log.error('Init', 'Failed to connect to existing database', { error });
      return res.status(500).json({
        code: 500,
        msg: 'Failed to connect to existing database. Please check your configuration.',
      });
    }
  }
  
  // Scenario C: Fresh initialization or reset
  try {
    // Save configuration
    saveDatabaseConfig(type, sqlite, mysqlConfig, pgConfig);
    
    // Generate JWT secret if needed
    const currentJwtSecret = process.env.JWT_SECRET || '';
    if (!currentJwtSecret || currentJwtSecret === 'dnsmgr-secret-key') {
      saveEnvConfig({ JWT_SECRET: crypto.randomBytes(32).toString('hex') });
    }
    
    // Create database connection with explicit config
    log.info('Init', 'Creating new database connection', { type, reset });
    const conn = await connect(testConfig);
    
    // Initialize schema
    if (reset) {
      await initSchemaAsync(conn, true);
      log.info('Init', 'Database schema reset successfully');
    } else {
      await initSchemaAsync(conn, false);
      log.info('Init', 'Database schema initialized successfully');
    }
    
    return res.json({
      code: 0,
      data: { success: true, reset },
      msg: reset ? 'Database reset successfully' : 'Database initialized successfully',
    });
  } catch (error) {
    log.error('Init', 'Database initialization error', { error, type, reset });
    return res.status(500).json({
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
    const hash = bcrypt.hashSync(password, 10);

    // 使用业务适配器创建用户，而不是直接调用数据库抽象层
    await UserOperations.create({
      username,
      nickname: username,
      email,
      password_hash: hash,
      role: 'admin',
      role_level: 3,
    });

    // 使用业务适配器轮换运行时密钥
    await SecretOperations.rotateRuntimeSecrets();

    log.info('Init', 'Admin user created successfully', { username, email });
    
    res.json({
      code: 0,
      data: { success: true },
      msg: 'Admin user created successfully',
    });
  } catch (error) {
    log.error('Init', 'Failed to create admin user', { error, username, email });
    res.status(500).json({
      code: 500,
      msg: error instanceof Error ? error.message : 'Failed to create admin user',
    });
  }
});

export default router;
