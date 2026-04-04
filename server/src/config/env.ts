import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables with priority:
// 1. data/.env (highest priority)
// 2. .env (root directory)
// 3. process.env (lowest priority)

export function loadEnv(): void {
  const rootDir = path.resolve(__dirname, '../..');
  const dataDir = path.join(rootDir, 'data');
  
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const dataEnvPath = path.join(dataDir, '.env');
  const rootEnvPath = path.join(rootDir, '.env');
  
  // Load root .env first (lowest priority)
  if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath });
  }
  
  // Load data/.env second (highest priority, overrides root .env)
  if (fs.existsSync(dataEnvPath)) {
    dotenv.config({ path: dataEnvPath, override: true });
  }
}

// Save configuration to data/.env
export function saveEnvConfig(config: Record<string, string>): void {
  const rootDir = path.resolve(__dirname, '../..');
  const dataDir = path.join(rootDir, 'data');
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
}

// Get current database configuration
export function getDbConfig(): {
  type: 'sqlite' | 'mysql' | 'postgresql';
  sqlite: { path: string };
  mysql: { host: string; port: number; database: string; user: string; password: string; ssl: boolean };
  postgresql: { host: string; port: number; database: string; user: string; password: string; ssl: boolean };
} {
  return {
    type: (process.env.DB_TYPE as 'sqlite' | 'mysql' | 'postgresql') || 'sqlite',
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
