import { getCurrentConnection, DbConnection } from './database';

// Helper type for query results
type QueryResult = Record<string, unknown>;

// MySQL reserved keywords that need to be escaped
const MYSQL_RESERVED_KEYWORDS = new Set([
  'key', 'value', 'order', 'group', 'primary', 'foreign', 'index', 'table', 'column',
  'database', 'select', 'insert', 'update', 'delete', 'from', 'where', 'and', 'or',
  'not', 'null', 'default', 'unique', 'check', 'references', 'constraint'
]);

// Convert ? placeholders to PostgreSQL $1, $2... format
function convertPlaceholders(sql: string, dbType: string): string {
  if (dbType !== 'postgresql') return sql;

  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

// Escape identifiers for MySQL (wrap in backticks)
function escapeMySqlIdentifiers(sql: string, dbType: string): string {
  if (dbType !== 'mysql') return sql;

  // Match patterns like "WHERE key =" or "SET key =" or "SELECT key FROM"
  // and escape the keyword with backticks
  let result = sql;

  // Escape standalone column names that are reserved keywords
  // Pattern: word boundaries around reserved keywords when used as identifiers
  MYSQL_RESERVED_KEYWORDS.forEach(keyword => {
    // Match the keyword when it's used as a column name (not in string literals)
    // Pattern: (WHERE|SET|SELECT|,|\()\s*keyword\s*(=|,|FROM|WHERE|SET)
    const regex = new RegExp(`(\\s+|^|\\()(${keyword})(\\s*=|\\s*,|\\s+FROM|\\s+WHERE|\\s+SET|\\s+AND|\\s+OR|$)`, 'gi');
    result = result.replace(regex, (match, before, kw, after) => {
      // Don't escape if already escaped
      if (before.endsWith('`') || after.startsWith('`')) return match;
      return `${before}\`${kw}\`${after}`;
    });
  });

  return result;
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

  // Process SQL for the specific database type
  private processSql(sql: string): string {
    let processed = sql;
    processed = convertPlaceholders(processed, this.conn.type);
    processed = escapeMySqlIdentifiers(processed, this.conn.type);
    return processed;
  }

  // Execute a query that returns multiple rows
  async query(sql: string, params?: unknown[]): Promise<QueryResult[]> {
    const convertedSql = this.processSql(sql);

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
    const convertedSql = this.processSql(sql);

    if (this.conn.type === 'sqlite') {
      const stmt = (this.conn as any).prepare(convertedSql);
      return stmt.get(...(params || [])) as QueryResult | undefined;
    }
    return await this.conn.get(convertedSql, params) as QueryResult | undefined;
  }

  // Execute an INSERT/UPDATE/DELETE query
  async execute(sql: string, params?: unknown[]): Promise<void> {
    const convertedSql = this.processSql(sql);

    if (this.conn.type === 'sqlite') {
      const stmt = (this.conn as any).prepare(convertedSql);
      stmt.run(...(params || []));
    } else {
      await this.conn.execute(convertedSql, params);
    }
  }

  // Execute INSERT and return the last insert ID
  async insert(sql: string, params?: unknown[]): Promise<number> {
    const convertedSql = this.processSql(sql);

    if (this.conn.type === 'sqlite') {
      const stmt = (this.conn as any).prepare(convertedSql);
      const result = stmt.run(...(params || []));
      return Number(result.lastInsertRowid);
    } else if (this.conn.type === 'mysql') {
      // MySQL: Use INSERT and then get LAST_INSERT_ID()
      await this.conn.execute(convertedSql, params);
      const result = await this.conn.get('SELECT LAST_INSERT_ID() as id');
      return (result as { id: number })?.id || 0;
    } else {
      // PostgreSQL: Use RETURNING clause or lastval()
      // Check if SQL already has RETURNING clause
      if (!convertedSql.toLowerCase().includes('returning')) {
        // Execute insert first
        await this.conn.execute(convertedSql, params);
        // Then get last value
        try {
          const result = await this.conn.get('SELECT lastval() as id');
          return (result as { id: number })?.id || 0;
        } catch {
          // lastval() might fail if no sequence was used
          return 0;
        }
      } else {
        // SQL already has RETURNING clause
        const result = await this.conn.get(convertedSql, params);
        return (result as { id: number })?.id || 0;
      }
    }
  }

  // Execute UPDATE/DELETE and return the number of affected rows
  async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    const convertedSql = this.processSql(sql);

    if (this.conn.type === 'sqlite') {
      const stmt = (this.conn as any).prepare(convertedSql);
      const result = stmt.run(...(params || []));
      return { changes: result.changes };
    } else if (this.conn.type === 'mysql') {
      // MySQL: execute and get affected rows info
      // mysql2 execute returns [ResultSetHeader, FieldPacket[]]
      // We need to access the ResultSetHeader which contains affectedRows
      const pool = (this.conn as any).pool;
      if (pool) {
        const [result] = await pool.execute(convertedSql, params);
        // ResultSetHeader has affectedRows property
        const affectedRows = (result as any).affectedRows || 0;
        return { changes: affectedRows };
      }
      await this.conn.execute(convertedSql, params);
      return { changes: 0 };
    } else {
      // PostgreSQL
      await this.conn.execute(convertedSql, params);
      // PostgreSQL doesn't easily return affected rows count without RETURNING
      return { changes: 0 };
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

  // Transaction support
  async beginTransaction(): Promise<void> {
    if (this.conn.type === 'sqlite') {
      await this.execute('BEGIN TRANSACTION');
    } else if (this.conn.type === 'mysql') {
      await this.execute('START TRANSACTION');
    } else if (this.conn.type === 'postgresql') {
      await this.execute('BEGIN');
    }
  }

  async commit(): Promise<void> {
    await this.execute('COMMIT');
  }

  async rollback(): Promise<void> {
    await this.execute('ROLLBACK');
  }

  // Execute function within a transaction
  async transaction<T>(fn: (db: DbAdapter) => Promise<T>): Promise<T> {
    await this.beginTransaction();
    try {
      const result = await fn(this);
      await this.commit();
      return result;
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }
}

// Helper function to get adapter instance
export function getAdapter(): DbAdapter | null {
  return DbAdapter.getInstance();
}
