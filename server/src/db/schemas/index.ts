export interface SchemaDefinition {
  createTables: string[];
  createIndexes: string[];
  alterTables?: string[];
}

/**
 * Calculate SHA256 hash of schema definition
 * Used for version tracking - any change in schema will produce a different hash
 */
export function calculateSchemaHash(schema: SchemaDefinition): string {
  const crypto = require('crypto');
  
  // Serialize schema to a consistent string format
  const schemaString = JSON.stringify({
    createTables: schema.createTables.sort(),
    createIndexes: schema.createIndexes.sort(),
    alterTables: (schema.alterTables || []).sort(),
  });
  
  // Calculate SHA256 hash and take first 16 characters for brevity
  return crypto.createHash('sha256').update(schemaString).digest('hex').substring(0, 16);
}

export * from './sqlite';
export * from './mysql';
export * from './postgresql';
