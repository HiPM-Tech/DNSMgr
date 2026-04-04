export interface SchemaDefinition {
  createTables: string[];
  createIndexes: string[];
  alterTables?: string[];
}

export * from './sqlite';
export * from './mysql';
export * from './postgresql';
