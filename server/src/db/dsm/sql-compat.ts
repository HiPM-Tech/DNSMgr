import { createLogger } from '../../lib/logger';

const log = createLogger('DSM').sub('SqlCompat');
export type DatabaseType = 'sqlite' | 'mysql' | 'postgresql';

export function getDbType(): DatabaseType {
  return (process.env.DB_TYPE as DatabaseType) || 'sqlite';
}

export function processSql(sql: string, dbType: DatabaseType = getDbType()): string {
  const originalSql = sql;

  if (dbType === 'postgresql') {
    let index = 0;
    sql = sql.replace(/\?/g, () => `$${++index}`);
  }

  if (dbType === 'mysql') {
    sql = processMySqlCompat(sql);
  }

  if (sql !== originalSql) {
    log.debug('SQL processed', {
      original: originalSql.substring(0, 200),
      processed: sql.substring(0, 200),
      dbType
    });
  }

  return sql;
}

function processMySqlCompat(sql: string): string {
  sql = convertOnConflictToOnDuplicateKey(sql);

  sql = escapeMySqlKeywords(sql);

  return sql;
}

function convertOnConflictToOnDuplicateKey(sql: string): string {
  return sql.replace(
    /ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE\s+SET\s+([\s\S]+?)(?:\s*$|\s+(?=RETURNING|WHERE|ORDER|LIMIT|OFFSET|INSERT|UPDATE|DELETE|SELECT))/i,
    (match, updateClause) => {
      const mysqlUpdateClause = updateClause.replace(
        /excluded\.([a-zA-Z_][a-zA-Z0-9_]*)/gi,
        'VALUES($1)'
      );
      return `ON DUPLICATE KEY UPDATE ${mysqlUpdateClause}`;
    }
  );
}

function escapeMySqlKeywords(sql: string): string {
  const keywords = ['key', 'value'];

  keywords.forEach(keyword => {
    const regex = new RegExp(`(?<!"\`)\\b${keyword}\\b(?!"\`)`, 'gi');

    sql = sql.replace(regex, (match, offset) => {
      const beforeContext = sql.substring(Math.max(0, offset - 30), offset).toUpperCase();
      const afterContext = sql.substring(offset + match.length, Math.min(sql.length, offset + match.length + 30)).toUpperCase();

      if (beforeContext.includes('ON DUPLICATE') && keyword.toLowerCase() === 'key') {
        return match;
      }

      if ((beforeContext.includes('FOREIGN') || beforeContext.includes('PRIMARY')) && keyword.toLowerCase() === 'key') {
        return match;
      }

      if (beforeContext.includes('ORDER') || beforeContext.includes('GROUP')) {
        return match;
      }

      if (beforeContext.includes('VALUES(') || beforeContext.includes('VALUES (')) {
        return match;
      }

      return `\`${keyword}\``;
    });
  });

  return sql;
}

export function buildUpsertSql(
  table: string,
  columns: string[],
  values: unknown[],
  conflictKey: string,
  updateColumns: string[],
  dbType: DatabaseType = getDbType()
): { sql: string; params: unknown[] } {
  const allColumns = [...columns, 'updated_at'];

  if (dbType === 'mysql') {
    const columnList = allColumns.map(col => col === 'key' || col === 'value' ? `\`${col}\`` : col).join(', ');
    const placeholders = allColumns.map(() => '?').join(', ');
    const updates = updateColumns.map(col => {
      const escaped = col === 'key' || col === 'value' ? `\`${col}\`` : col;
      return `${escaped} = VALUES(${escaped})`;
    }).join(', ');

    const sql = `INSERT INTO ${table} (${columnList}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}, updated_at = NOW()`;
    return { sql, params: [...values, 'NOW()'] };
  } else if (dbType === 'postgresql') {
    const columnList = allColumns.join(', ');
    const placeholders = allColumns.map((_, i) => `$${i + 1}`).join(', ');
    const updates = updateColumns.map(col => {
      return `${col} = EXCLUDED.${col}`;
    }).join(', ');

    const sql = `INSERT INTO ${table} (${columnList}) VALUES (${placeholders}) ON CONFLICT(${conflictKey}) DO UPDATE SET ${updates}, updated_at = NOW()`;
    return { sql, params: [...values, 'NOW()'] };
  } else {
    const columnList = allColumns.join(', ');
    const placeholders = allColumns.map(() => '?').join(', ');
    const updates = updateColumns.map(col => {
      return `${col} = excluded.${col}`;
    }).join(', ');

    const sql = `INSERT INTO ${table} (${columnList}) VALUES (${placeholders}) ON CONFLICT(${conflictKey}) DO UPDATE SET ${updates}, updated_at = CURRENT_TIMESTAMP`;
    return { sql, params: [...values, 'CURRENT_TIMESTAMP'] };
  }
}