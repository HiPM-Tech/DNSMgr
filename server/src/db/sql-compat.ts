/**
 * SQL 兼容性处理模块
 * 统一处理不同数据库之间的 SQL 语法差异
 */

import { log } from '../lib/logger';

export type DatabaseType = 'sqlite' | 'mysql' | 'postgresql';

/**
 * 获取当前数据库类型
 */
export function getDbType(): DatabaseType {
  return (process.env.DB_TYPE as DatabaseType) || 'sqlite';
}

/**
 * 处理 SQL 语句，使其兼容当前数据库类型
 */
export function processSql(sql: string, dbType: DatabaseType = getDbType()): string {
  const originalSql = sql;
  
  // PostgreSQL: 转换 ? 占位符为 $1, $2...
  if (dbType === 'postgresql') {
    let index = 0;
    sql = sql.replace(/\?/g, () => `$${++index}`);
  }
  
  // MySQL: 处理兼容性
  if (dbType === 'mysql') {
    sql = processMySqlCompat(sql);
  }
  
  if (sql !== originalSql) {
    log.debug('SQLCompat', 'SQL processed', { 
      original: originalSql.substring(0, 200), 
      processed: sql.substring(0, 200),
      dbType 
    });
  }
  
  return sql;
}

/**
 * MySQL 兼容性处理
 */
function processMySqlCompat(sql: string): string {
  // 1. 转换 ON CONFLICT 为 ON DUPLICATE KEY UPDATE
  // 必须在关键字转义之前处理
  sql = convertOnConflictToOnDuplicateKey(sql);
  
  // 2. 转义保留关键字
  sql = escapeMySqlKeywords(sql);
  
  return sql;
}

/**
 * 转换 ON CONFLICT 为 ON DUPLICATE KEY UPDATE
 */
function convertOnConflictToOnDuplicateKey(sql: string): string {
  // 匹配: ON CONFLICT(...) DO UPDATE SET col = excluded.col, ...
  // 注意：需要处理多行和复杂的 UPDATE 子句
  return sql.replace(
    /ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE\s+SET\s+([\s\S]+?)(?:\s*$|\s+(?=RETURNING|WHERE|ORDER|LIMIT|OFFSET|INSERT|UPDATE|DELETE|SELECT))/i,
    (match, updateClause) => {
      // 转换 excluded.col 为 VALUES(col)
      const mysqlUpdateClause = updateClause.replace(
        /excluded\.([a-zA-Z_][a-zA-Z0-9_]*)/gi,
        'VALUES($1)'
      );
      return `ON DUPLICATE KEY UPDATE ${mysqlUpdateClause}`;
    }
  );
}

/**
 * 转义 MySQL 保留关键字
 */
function escapeMySqlKeywords(sql: string): string {
  const keywords = ['key', 'value'];
  
  keywords.forEach(keyword => {
    // 使用更精确的正则：匹配未转义的关键字
    // 前面不是反引号，后面也不是反引号
    const regex = new RegExp(`(?<!"\`)\\b${keyword}\\b(?!"\`)`, 'gi');
    
    sql = sql.replace(regex, (match, offset) => {
      // 获取上下文
      const beforeContext = sql.substring(Math.max(0, offset - 30), offset).toUpperCase();
      const afterContext = sql.substring(offset + match.length, Math.min(sql.length, offset + match.length + 30)).toUpperCase();
      
      // 跳过 SQL 关键字上下文中的 KEY
      // ON DUPLICATE KEY UPDATE
      if (beforeContext.includes('ON DUPLICATE') && keyword.toLowerCase() === 'key') {
        return match;
      }
      
      // FOREIGN KEY / PRIMARY KEY
      if ((beforeContext.includes('FOREIGN') || beforeContext.includes('PRIMARY')) && keyword.toLowerCase() === 'key') {
        return match;
      }
      
      // ORDER BY / GROUP BY
      if (beforeContext.includes('ORDER') || beforeContext.includes('GROUP')) {
        return match;
      }
      
      // 跳过函数调用中的关键字，如 VALUES(...)
      if (beforeContext.includes('VALUES(') || beforeContext.includes('VALUES (')) {
        return match;
      }
      
      return `\`${keyword}\``;
    });
  });
  
  return sql;
}

/**
 * 生成 UPSERT SQL（兼容所有数据库）
 */
export function buildUpsertSql(
  table: string,
  columns: string[],
  values: unknown[],
  conflictKey: string,
  updateColumns: string[],
  dbType: DatabaseType = getDbType()
): { sql: string; params: unknown[] } {
  // 添加 updated_at 列
  const allColumns = [...columns, 'updated_at'];
  
  if (dbType === 'mysql') {
    // MySQL: INSERT ... ON DUPLICATE KEY UPDATE
    const columnList = allColumns.map(col => col === 'key' || col === 'value' ? `\`${col}\`` : col).join(', ');
    const placeholders = allColumns.map(() => '?').join(', ');
    const updates = updateColumns.map(col => {
      const escaped = col === 'key' || col === 'value' ? `\`${col}\`` : col;
      return `${escaped} = VALUES(${escaped})`;
    }).join(', ');
    
    const sql = `INSERT INTO ${table} (${columnList}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}, updated_at = NOW()`;
    return { sql, params: [...values, 'NOW()'] };
  } else if (dbType === 'postgresql') {
    // PostgreSQL: INSERT ... ON CONFLICT DO UPDATE
    const columnList = allColumns.join(', ');
    const placeholders = allColumns.map((_, i) => `$${i + 1}`).join(', ');
    const updates = updateColumns.map(col => {
      return `${col} = EXCLUDED.${col}`;
    }).join(', ');
    
    const sql = `INSERT INTO ${table} (${columnList}) VALUES (${placeholders}) ON CONFLICT(${conflictKey}) DO UPDATE SET ${updates}, updated_at = NOW()`;
    return { sql, params: [...values, 'NOW()'] };
  } else {
    // SQLite: INSERT ... ON CONFLICT DO UPDATE
    const columnList = allColumns.join(', ');
    const placeholders = allColumns.map(() => '?').join(', ');
    const updates = updateColumns.map(col => {
      return `${col} = excluded.${col}`;
    }).join(', ');
    
    const sql = `INSERT INTO ${table} (${columnList}) VALUES (${placeholders}) ON CONFLICT(${conflictKey}) DO UPDATE SET ${updates}, updated_at = CURRENT_TIMESTAMP`;
    return { sql, params: [...values, 'CURRENT_TIMESTAMP'] };
  }
}
