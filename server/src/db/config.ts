export type DatabaseType = 'sqlite' | 'mysql' | 'postgresql';

export interface DatabaseConfig {
  type: DatabaseType;
  sqlite?: {
    path: string;
  };
  mysql?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
    connectionLimit?: number;
  };
  postgresql?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
    poolSize?: number;
  };
}

export function getDatabaseConfig(): DatabaseConfig {
  const dbType = (process.env.DB_TYPE as DatabaseType) || 'sqlite';

  switch (dbType) {
    case 'mysql':
      return {
        type: 'mysql',
        mysql: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '3306', 10),
          database: process.env.DB_NAME || 'dnsmgr',
          user: process.env.DB_USER || 'root',
          password: process.env.DB_PASSWORD || '',
          ssl: process.env.DB_SSL === 'true',
          connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
        },
      };

    case 'postgresql':
      return {
        type: 'postgresql',
        postgresql: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          database: process.env.DB_NAME || 'dnsmgr',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || '',
          ssl: process.env.DB_SSL === 'true',
          poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),
        },
      };

    case 'sqlite':
    default:
      return {
        type: 'sqlite',
        sqlite: {
          path: process.env.DB_PATH || './data/dnsmgr.db',
        },
      };
  }
}
