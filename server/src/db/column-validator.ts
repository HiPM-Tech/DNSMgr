/**
 * Column Type Validator
 * 数据库列类型验证工具
 * 
 * 用于在迁移前后验证列的类型、约束和默认值是否符合预期
 */

import { log } from '../lib/logger';

export interface ColumnSpec {
  tableName: string;
  columnName: string;
  expectedType: string;      // e.g., 'VARCHAR(255)', 'INT', 'DATETIME'
  expectedNullable?: boolean;
  expectedDefault?: any;
}

export interface ColumnInfo {
  tableName: string;
  columnName: string;
  actualType: string;
  isNullable: boolean;
  defaultValue: any;
  matchesExpected: boolean;
  issues: string[];
}

/**
 * 验证单个列的规格
 */
export async function validateColumn(
  conn: any,
  spec: ColumnSpec,
  dbType: 'mysql' | 'postgresql' | 'sqlite'
): Promise<ColumnInfo> {
  const issues: string[] = [];
  let actualType = '';
  let isNullable = true;
  let defaultValue: any = null;

  try {
    if (dbType === 'mysql') {
      const sql = `
        SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = ? AND COLUMN_NAME = ?
        LIMIT 1
      `;
      const result = await conn.query(sql, [spec.tableName, spec.columnName]);
      
      if (Array.isArray(result) && result.length > 0) {
        const row = result[0];
        actualType = row.COLUMN_TYPE || '';
        isNullable = row.IS_NULLABLE === 'YES';
        defaultValue = row.COLUMN_DEFAULT;
      }
    } else if (dbType === 'postgresql') {
      const sql = `
        SELECT data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1 AND column_name = $2
        LIMIT 1
      `;
      const result = await conn.query(sql, [spec.tableName, spec.columnName]);
      
      if (Array.isArray(result) && result.length > 0) {
        const row = result[0];
        actualType = row.data_type || '';
        isNullable = row.is_nullable === 'YES';
        defaultValue = row.column_default;
      }
    } else if (dbType === 'sqlite') {
      const sql = `PRAGMA table_info(${spec.tableName})`;
      const result = await conn.execute(sql);
      
      if (Array.isArray(result)) {
        const column = result.find((row: any) => row.name === spec.columnName);
        if (column) {
          actualType = column.type || '';
          isNullable = column.notnull === 0;
          defaultValue = column.dflt_value;
        }
      }
    }

    // 验证类型匹配
    const typeMatches = actualType.toUpperCase().includes(spec.expectedType.toUpperCase());
    if (!typeMatches) {
      issues.push(`Type mismatch: expected ${spec.expectedType}, got ${actualType}`);
    }

    // 验证可空性
    if (spec.expectedNullable !== undefined && isNullable !== spec.expectedNullable) {
      issues.push(
        `Nullable mismatch: expected ${spec.expectedNullable ? 'NULLABLE' : 'NOT NULL'}, got ${isNullable ? 'NULLABLE' : 'NOT NULL'}`
      );
    }

    // 验证默认值（如果指定）
    if (spec.expectedDefault !== undefined) {
      const defaultMatches = String(defaultValue) === String(spec.expectedDefault);
      if (!defaultMatches) {
        issues.push(
          `Default value mismatch: expected ${spec.expectedDefault}, got ${defaultValue}`
        );
      }
    }

    return {
      tableName: spec.tableName,
      columnName: spec.columnName,
      actualType,
      isNullable,
      defaultValue,
      matchesExpected: issues.length === 0,
      issues,
    };
  } catch (error) {
    log.error('ColumnValidator', `Failed to validate column ${spec.tableName}.${spec.columnName}`, {
      error: (error as Error).message,
    });
    
    return {
      tableName: spec.tableName,
      columnName: spec.columnName,
      actualType: '',
      isNullable: true,
      defaultValue: null,
      matchesExpected: false,
      issues: [`Validation failed: ${(error as Error).message}`],
    };
  }
}

/**
 * 批量验证多个列
 */
export async function validateColumns(
  conn: any,
  specs: ColumnSpec[],
  dbType: 'mysql' | 'postgresql' | 'sqlite'
): Promise<ColumnInfo[]> {
  const results: ColumnInfo[] = [];
  
  for (const spec of specs) {
    const result = await validateColumn(conn, spec, dbType);
    results.push(result);
    
    if (result.matchesExpected) {
      log.debug('ColumnValidator', `✓ ${spec.tableName}.${spec.columnName} is valid`);
    } else {
      log.warn('ColumnValidator', `✗ ${spec.tableName}.${spec.columnName} has issues:`, {
        issues: result.issues,
      });
    }
  }
  
  return results;
}

/**
 * 生成验证报告
 */
export function generateValidationReport(results: ColumnInfo[]): string {
  const total = results.length;
  const passed = results.filter(r => r.matchesExpected).length;
  const failed = total - passed;
  
  let report = `\n=== Column Validation Report ===\n`;
  report += `Total: ${total}, Passed: ${passed}, Failed: ${failed}\n\n`;
  
  if (failed > 0) {
    report += `FAILED COLUMNS:\n`;
    results.forEach(result => {
      if (!result.matchesExpected) {
        report += `  - ${result.tableName}.${result.columnName}:\n`;
        result.issues.forEach(issue => {
          report += `    • ${issue}\n`;
        });
      }
    });
    report += '\n';
  }
  
  report += `PASSED COLUMNS:\n`;
  results.forEach(result => {
    if (result.matchesExpected) {
      report += `  ✓ ${result.tableName}.${result.columnName} (${result.actualType})\n`;
    }
  });
  
  return report;
}

/**
 * 预定义的常见列规格
 */
export const COMMON_COLUMN_SPECS = {
  // 通用字段
  ID: { expectedType: 'INT', expectedNullable: false },
  CREATED_AT: { expectedType: 'DATETIME', expectedNullable: false },
  UPDATED_AT: { expectedType: 'DATETIME', expectedNullable: false },
  
  // DNS 相关
  DOMAIN_NAME: { expectedType: 'VARCHAR', expectedNullable: false },
  DNS_TYPE: { expectedType: 'VARCHAR', expectedNullable: false },
  DNS_VALUE: { expectedType: 'TEXT', expectedNullable: false },
  
  // 布尔字段
  ENABLED_FLAG: { expectedType: 'TINYINT', expectedNullable: false, expectedDefault: '1' },
};
