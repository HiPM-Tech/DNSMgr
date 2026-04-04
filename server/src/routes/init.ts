import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDb, isDbInitialized, hasUsers, testDatabaseConnection } from '../db';
import { initSchema } from '../db/schema';

const router = Router();

// Check system initialization status
router.get('/status', (req: Request, res: Response) => {
  const dbInitialized = isDbInitialized();
  const hasAnyUsers = hasUsers();
  
  res.json({
    code: 0,
    data: {
      initialized: dbInitialized && hasAnyUsers,
      dbInitialized,
      hasUsers: hasAnyUsers,
    },
    msg: 'success',
  });
});

// Test database connection
router.post('/test-db', async (req: Request, res: Response) => {
  const { type, sqlite, mysql, postgresql } = req.body;
  
  if (!type || !['sqlite', 'mysql', 'postgresql'].includes(type)) {
    return res.status(400).json({ code: 400, msg: 'Invalid database type' });
  }
  
  const result = await testDatabaseConnection({ type, sqlite, mysql, postgresql });
  
  res.json({
    code: result.success ? 0 : 400,
    data: { success: result.success, message: result.message },
    msg: result.success ? 'success' : result.message,
  });
});

// Initialize database
router.post('/database', async (req: Request, res: Response) => {
  // Prevent re-initialization if already has users
  if (hasUsers()) {
    return res.status(400).json({ code: 400, msg: 'System already initialized' });
  }
  
  const { type, sqlite, mysql, postgresql } = req.body;
  
  if (!type || !['sqlite', 'mysql', 'postgresql'].includes(type)) {
    return res.status(400).json({ code: 400, msg: 'Invalid database type' });
  }
  
  try {
    // Test connection first
    const testResult = await testDatabaseConnection({ type, sqlite, mysql, postgresql });
    if (!testResult.success) {
      return res.status(400).json({ code: 400, msg: testResult.message });
    }
    
    // For now, we only support SQLite fully
    // MySQL and PostgreSQL support would require more implementation
    if (type !== 'sqlite') {
      return res.status(400).json({ 
        code: 400, 
        msg: 'Only SQLite is fully supported in this version. MySQL and PostgreSQL support coming soon.' 
      });
    }
    
    // Initialize schema
    initSchema();
    
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
  // Check if already initialized
  if (hasUsers()) {
    return res.status(400).json({ code: 400, msg: 'Admin user already exists' });
  }
  
  // Check if database is initialized
  if (!isDbInitialized()) {
    return res.status(400).json({ code: 400, msg: 'Database not initialized. Please initialize database first.' });
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
    const db = getDb();
    const hash = bcrypt.hashSync(password, 10);
    
    db.prepare(
      `INSERT INTO users (username, nickname, email, password_hash, role, role_level, status) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(username, username, email, hash, 'admin', 3, 1);
    
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
