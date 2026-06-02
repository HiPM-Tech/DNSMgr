export interface SchemaDefinition {
  createTables: string[];
  createIndexes: string[];
  alterTables?: string[];
}

export function calculateSchemaHash(schema: SchemaDefinition): string {
  const crypto = require('crypto');
  
  const schemaString = JSON.stringify({
    createTables: schema.createTables.sort(),
    createIndexes: schema.createIndexes.sort(),
    alterTables: (schema.alterTables || []).sort(),
  });
  
  return crypto.createHash('sha256').update(schemaString).digest('hex').substring(0, 16);
}

export * from './dialects/sqlite';
export * from './dialects/mysql';
export * from './dialects/postgresql';