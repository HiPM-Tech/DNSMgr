import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { log } from '../lib/logger';

// Get the current working directory (where the server is running)
function getCwd(): string {
  return process.cwd();
}

// Load environment variables with priority:
// 1. ./data/.env (current working directory, highest priority)
// 2. .env (root directory)
// 3. process.env (lowest priority)

export function loadEnv(): void {
  const cwd = getCwd();
  const dataDir = path.join(cwd, 'data');

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dataEnvPath = path.join(dataDir, '.env');
  const rootEnvPath = path.join(cwd, '.env');

  log.info('Env', 'Current working directory', { cwd });
  log.info('Env', 'Looking for data/.env', { path: dataEnvPath });
  log.info('Env', 'Looking for root .env', { path: rootEnvPath });

  // Load root .env first (lowest priority)
  if (fs.existsSync(rootEnvPath)) {
    log.info('Env', 'Loading root .env');
    dotenv.config({ path: rootEnvPath });
  } else {
    log.info('Env', 'Root .env not found');
  }

  // Load data/.env second (highest priority, overrides root .env)
  if (fs.existsSync(dataEnvPath)) {
    log.info('Env', 'Loading data/.env');
    const result = dotenv.config({ path: dataEnvPath, override: true });
    if (result.error) {
      log.error('Env', 'Error loading data/.env', { error: result.error });
    } else {
      log.info('Env', 'data/.env loaded successfully');
    }
  } else {
    log.info('Env', 'data/.env not found');
  }

  log.info('Env', 'DB_TYPE after loading', { dbType: process.env.DB_TYPE || 'not set' });
}

// Save configuration to ./data/.env (current working directory)
export function saveEnvConfig(config: Record<string, string>): void {
  const cwd = getCwd();
  const dataDir = path.join(cwd, 'data');
  const envPath = path.join(dataDir, '.env');
  
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Read existing content if file exists
  let existingContent = '';
  if (fs.existsSync(envPath)) {
    existingContent = fs.readFileSync(envPath, 'utf-8');
  }
  
  // Parse existing config
  const existingConfig: Record<string, string> = {};
  existingContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      existingConfig[match[1].trim()] = match[2].trim();
    }
  });
  
  // Merge with new config
  const mergedConfig = { ...existingConfig, ...config };
  
  // Write back
  const content = Object.entries(mergedConfig)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  fs.writeFileSync(envPath, content);
  
  // Reload environment variables
  dotenv.config({ path: envPath, override: true });
  
  // Also directly update process.env to ensure the changes take effect immediately
  Object.entries(config).forEach(([key, value]) => {
    process.env[key] = value;
  });
}

// Validate environment variables
export function validateEnv(): void {
  const errors: string[] = [];

  // 生产环境检查JWT_SECRET强度（如果设置了的话）
  if (process.env.NODE_ENV === 'production') {
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret && jwtSecret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters long');
    }
  }

  // 验证数据库配置
  const dbType = process.env.DB_TYPE || 'sqlite';
  if (dbType === 'mysql' || dbType === 'postgresql') {
    if (!process.env.DB_HOST) {
      errors.push(`DB_HOST is required for ${dbType} database`);
    }
    if (!process.env.DB_PASSWORD) {
      errors.push(`DB_PASSWORD is required for ${dbType} database`);
    }
    if (!process.env.DB_NAME) {
      errors.push(`DB_NAME is required for ${dbType} database`);
    }
  }

  // 如果有错误，抛出异常
  if (errors.length > 0) {
    log.error('Env', 'Environment Validation Failed', { errors });
    throw new Error(`Environment validation failed: ${errors.join(', ')}`);
  }
}

// Get current database configuration
export function getDbConfig(): {
  type: 'sqlite' | 'mysql' | 'postgresql';
  sqlite: { path: string };
  mysql: { host: string; port: number; database: string; user: string; password: string; ssl: boolean };
  postgresql: { host: string; port: number; database: string; user: string; password: string; ssl: boolean };
} {
  log.info('Env', 'getDbConfig() called', { dbType: process.env.DB_TYPE || 'not set' });

  // 在获取配置前验证环境变量
  validateEnv();

  const dbType = (process.env.DB_TYPE as 'sqlite' | 'mysql' | 'postgresql') || 'sqlite';
  log.info('Env', 'Using database type', { dbType });

  return {
    type: dbType,
    sqlite: {
      path: process.env.DB_PATH || './data/dnsmgr.db',
    },
    mysql: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      database: process.env.DB_NAME || 'dnsmgr',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true',
    },
    postgresql: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'dnsmgr',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true',
    },
  };
}
