/**
 * 标识符转义工具
 * 处理 SQL 标识符的转义和保留关键字检测
 */

import type { DatabaseType } from '../core/types';
import {
  MYSQL_RESERVED_KEYWORDS,
  POSTGRESQL_RESERVED_KEYWORDS,
  SQLITE_RESERVED_KEYWORDS,
} from '../core/types';

/** 标识符转义器接口 */
export interface IdentifierEscaper {
  /** 转义标识符 */
  escape(name: string): string;
  /** 检查是否为保留关键字 */
  isReserved(name: string): boolean;
  /** 安全地引用标识符（如果是保留字则自动转义） */
  quote(name: string): string;
}

/** MySQL 标识符转义器 */
export class MySQLIdentifierEscaper implements IdentifierEscaper {
  escape(name: string): string {
    return `\`${name}\``;
  }

  isReserved(name: string): boolean {
    return MYSQL_RESERVED_KEYWORDS.has(name.toLowerCase());
  }

  quote(name: string): string {
    return this.escape(name);
  }
}

/** PostgreSQL 标识符转义器 */
export class PostgreSQLIdentifierEscaper implements IdentifierEscaper {
  escape(name: string): string {
    return `"${name}"`;
  }

  isReserved(name: string): boolean {
    return POSTGRESQL_RESERVED_KEYWORDS.has(name.toLowerCase());
  }

  quote(name: string): string {
    return this.escape(name);
  }
}

/** SQLite 标识符转义器 */
export class SQLiteIdentifierEscaper implements IdentifierEscaper {
  escape(name: string): string {
    return `"${name}"`;
  }

  isReserved(name: string): boolean {
    return SQLITE_RESERVED_KEYWORDS.has(name.toLowerCase());
  }

  quote(name: string): string {
    return this.escape(name);
  }
}

/** 标识符转义器工厂 */
export function createIdentifierEscaper(type: DatabaseType): IdentifierEscaper {
  switch (type) {
    case 'mysql':
      return new MySQLIdentifierEscaper();
    case 'postgresql':
      return new PostgreSQLIdentifierEscaper();
    case 'sqlite':
      return new SQLiteIdentifierEscaper();
    default:
      throw new Error(`Unsupported database type: ${type}`);
  }
}

/** 获取默认标识符转义器 */
export function getDefaultIdentifierEscaper(): IdentifierEscaper {
  const type = (process.env.DB_TYPE as DatabaseType) || 'sqlite';
  return createIdentifierEscaper(type);
}

/** 列名别名生成器 */
export function generateAlias(baseName: string, index?: number): string {
  if (index === undefined) {
    return baseName;
  }
  return `${baseName}_${index}`;
}

/** 检查标识符是否需要转义 */
export function needsEscaping(name: string, type: DatabaseType): boolean {
  const escaper = createIdentifierEscaper(type);
  return escaper.isReserved(name);
}

/** 批量转义标识符 */
export function escapeIdentifiers(names: string[], type: DatabaseType): string[] {
  const escaper = createIdentifierEscaper(type);
  return names.map(name => escaper.escape(name));
}
