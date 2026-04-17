import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { initSchema, initSchemaAsync } from '../db/schema';
import { saveEnvConfig, getDbConfig } from '../config/env';
import { createConnection, isDbInitialized, hasUsers } from '../db/connection';
import { UserOperations, SystemOperations, SecretOperations } from '../db/business-adapter';
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

  // First, temporarily set up config to test connection and check existing data
  const testConfig: any = { type };
  if (type === 'sqlite') {
    testConfig.sqlite = sqlite || { path: './data/dnsmgr.db' };
  } else if (type === 'mysql') {
    testConfig.mysql = mysqlConfig;
  } else if (type === 'postgresql') {
    testConfig.postgresql = pgConfig;
  }

  // Test connection and check for existing data before saving config
  let hasExistingData = false;
  let hasExistingUsers = false;
  try {
    const testResult = await SystemOperations.testConnection(testConfig);
    hasExistingData = testResult.hasExistingData;
    // If we can connect and there's data, check if there are users
    if (hasExistingData) {
      // Create a temporary connection to check for users
      const { connect } = await import('../db/core/connection');
      const tempConn = await connect();
      const userResult = await tempConn.get('SELECT COUNT(*) as cnt FROM users');
      hasExistingUsers = (userResult as { cnt: number })?.cnt > 0;
      await tempConn.close();
    }
  } catch (error) {
    // Connection failed or no existing data, proceed with normal initialization
    log.debug('Init', 'No existing database connection or no data found', { error });
  }

  // If system has existing users and user chooses to keep data (not reset),
  // allow skipping to complete step (for server migration scenarios)
  if (hasExistingData && hasExistingUsers && !reset) {
    // Save config first so the system can use it
    saveEnvConfig({
      DB_TYPE: type,
      ...(type === 'sqlite' && { DB_PATH: sqlite?.path || './data/dnsmgr.db' }),
      ...(type === 'mysql' && {
        DB_HOST: mysqlConfig.host,
        DB_PORT: String(mysqlConfig.port || 3306),
        DB_NAME: mysqlConfig.database,
        DB_USER: mysqlConfig.user,
        DB_PASSWORD: mysqlConfig.password,
        DB_SSL: mysqlConfig.ssl ? 'true' : 'false',
      }),
      ...(type === 'postgresql' && {
        DB_HOST: pgConfig.host,
        DB_PORT: String(pgConfig.port || 5432),
        DB_NAME: pgConfig.database,
        DB_USER: pgConfig.user,
        DB_PASSWORD: pgConfig.password,
        DB_SSL: pgConfig.ssl ? 'true' : 'false',
      }),
    });
    return res.json({
      code: 0,
      data: { 
        success: true, 
        skipToComplete: true,
        message: 'Database already initialized with users. Setup complete.'
      },
      msg: 'Database already initialized with users. Setup complete.',
    });
  }
  
  // If database has data but no users, allow skipping to user creation
  if (hasExistingData && !hasExistingUsers && !reset) {
    // Save config first
    saveEnvConfig({
      DB_TYPE: type,
      ...(type === 'sqlite' && { DB_PATH: sqlite?.path || './data/dnsmgr.db' }),
      ...(type === 'mysql' && {
        DB_HOST: mysqlConfig.host,
        DB_PORT: String(mysqlConfig.port || 3306),
        DB_NAME: mysqlConfig.database,
        DB_USER: mysqlConfig.user,
        DB_PASSWORD: mysqlConfig.password,
        DB_SSL: mysqlConfig.ssl ? 'true' : 'false',
      }),
      ...(type === 'postgresql' && {
        DB_HOST: pgConfig.host,
        DB_PORT: String(pgConfig.port || 5432),
        DB_NAME: pgConfig.database,
        DB_USER: pgConfig.user,
        DB_PASSWORD: pgConfig.password,
        DB_SSL: pgConfig.ssl ? 'true' : 'false',
      }),
    });
    return res.json({
      code: 0,
      data: { 
        success: true, 
        skipToUserCreation: true,
        message: 'Database already initialized. Proceed to create admin user.'
      },
      msg: 'Database already initialized. Please create admin user.',
    });
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
      // Normalize path for Windows
      let dbPath = sqlite?.path || './data/dnsmgr.db';
      // Convert backslashes to forward slashes for consistency
      dbPath = dbPath.replace(/\\/g, '/');
      envConfig.DB_PATH = dbPath;
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
