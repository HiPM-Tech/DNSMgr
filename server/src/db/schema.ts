/**
 * Database Schema Module (Deprecated)
 * 
 * This file has been deprecated. All schema management is now handled by DSM.
 * Please use initializeDSM() from './init-dsm' instead.
 */

import { sqliteSchema } from './schemas/sqlite';
import { mysqlSchema } from './schemas/mysql';
import { postgresqlSchema } from './schemas/postgresql';
import { log } from '../lib/logger';

// Re-export schema definitions for backward compatibility
export { sqliteSchema, mysqlSchema, postgresqlSchema };

/**
 * @deprecated Use initializeDSM() from './init-dsm' instead.
 */
export async function initSchema(): Promise<void> {
  log.warn('Schema', '[DEPRECATED] initSchema is deprecated. Please use initializeDSM().');
}

/**
 * @deprecated Use initializeDSM() from './init-dsm' instead.
 */
export async function initSchemaAsync(conn: any, reset: boolean = false): Promise<void> {
  log.warn('Schema', '[DEPRECATED] initSchemaAsync is deprecated. Please use initializeDSM().');
}
