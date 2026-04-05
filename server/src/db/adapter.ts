import { getCurrentConnection, DbConnection } from './database';

// Helper type for query results
type QueryResult = Record<string, unknown>;

// Convert ? placeholders to PostgreSQL $1, $2... format
function convertPlaceholders(sql: string, dbType: string): string {
  if (dbType !== 'postgresql') return sql;
  
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

// Database adapter class that provides unified interface for all database types
export class DbAdapter {
  private conn: DbConnection;

  constructor(conn: DbConnection) {
    this.conn = conn;
  }

  static getInstance(): DbAdapter | null {
    const conn = getCurrentConnection();
    if (!conn) return null;
    return new DbAdapter(conn);
  }

  get type(): string {
    return this.conn.type;
  }

  // Execute a query that returns multiple rows
  async query(sql: string, params?: unknown[]): Promise<QueryResult[]> {
    const convertedSql = convertPlaceholders(sql, this.conn.type);
    
    if (this.conn.type === 'sqlite') {
      const stmt = (this.conn as any).prepare(convertedSql);
      if (convertedSql.trim().toLowerCase().startsWith('select')) {
        return stmt.all(...(params || [])) as QueryResult[];
      }
      stmt.run(...(params || []));
      return [];
    }
    return await this.conn.query(convertedSql, params) as QueryResult[];
  }

  // Execute a query that returns a single row
  async get(sql: string, params?: unknown[]): Promise<QueryResult | undefined> {
    const convertedSql = convertPlaceholders(sql, this.conn.type);
    
    if (this.conn.type === 'sqlite') {
      const stmt = (this.conn as any).prepare(convertedSql);
      return stmt.get(...(params || [])) as QueryResult | undefined;
    }
    return await this.conn.get(convertedSql, params) as QueryResult | undefined;
  }

  // Execute an INSERT/UPDATE/DELETE query
  async execute(sql: string, params?: unknown[]): Promise<void> {
    const convertedSql = convertPlaceholders(sql, this.conn.type);
    
    if (this.conn.type === 'sqlite') {
      const stmt = (this.conn as any).prepare(convertedSql);
      stmt.run(...(params || []));
    } else {
      await this.conn.execute(convertedSql, params);
    }
  }

  // Execute INSERT and return the last insert ID
  async insert(sql: string, params?: unknown[]): Promise<number> {
    const convertedSql = convertPlaceholders(sql, this.conn.type);
    
    if (this.conn.type === 'sqlite') {
      const stmt = (this.conn as any).prepare(convertedSql);
      const result = stmt.run(...(params || []));
      return Number(result.lastInsertRowid);
    } else if (this.conn.type === 'mysql') {
      await this.conn.execute(convertedSql, params);
      const result = await this.conn.get('SELECT LAST_INSERT_ID() as id');
      return (result as { id: number })?.id || 0;
    } else {
      // PostgreSQL
      await this.conn.execute(convertedSql, params);
      const result = await this.conn.get('SELECT lastval() as id');
      return (result as { id: number })?.id || 0;
    }
  }

  // Execute UPDATE/DELETE and return the number of affected rows
  async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    const convertedSql = convertPlaceholders(sql, this.conn.type);
    
    if (this.conn.type === 'sqlite') {
      const stmt = (this.conn as any).prepare(convertedSql);
      const result = stmt.run(...(params || []));
      return { changes: result.changes };
    } else {
      // For MySQL/PostgreSQL, we can't easily get affected rows count
      await this.conn.execute(convertedSql, params);
      return { changes: 0 }; // TODO: Implement proper row count
    }
  }

  // Get current timestamp function for SQL
  now(): string {
    if (this.conn.type === 'sqlite') {
      return "datetime('now')";
    }
    return 'NOW()';
  }

  // Get date comparison function
  dateCompare(column: string, operator: string, value: string): string {
    if (this.conn.type === 'sqlite') {
      return `date(${column}) ${operator} date(?)`;
    }
    return `${column} ${operator} ?`;
  }
}

// Helper function to get adapter instance
export function getAdapter(): DbAdapter | null {
  return DbAdapter.getInstance();
}
