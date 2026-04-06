#!/usr/bin/env node

/**
 * Database Reset Script
 * Usage: node reset-db.js [mysql|sqlite|postgresql]
 */

const { createConnection, closeConnection } = require('../dist/db/database');
const { initSchemaAsync } = require('../dist/db/schema');
const { loadEnv } = require('../dist/config/env');

// Load environment variables
loadEnv();

async function resetDatabase() {
  const dbType = process.env.DB_TYPE || 'sqlite';

  console.log(`[ResetDB] Starting database reset for: ${dbType}`);

  try {
    // Create connection
    const conn = await createConnection();
    console.log(`[ResetDB] Connected to ${conn.type}`);

    // Reset schema (drop all tables and recreate)
    console.log('[ResetDB] Dropping all tables...');
    await initSchemaAsync(conn, true);

    console.log('[ResetDB] Database reset successfully!');
    console.log('[ResetDB] Please access the setup wizard to reinitialize:');
    console.log('[ResetDB] http://your-server:3001/setup');

    await closeConnection();
    process.exit(0);
  } catch (error) {
    console.error('[ResetDB] Error:', error.message);
    process.exit(1);
  }
}

// Confirm before reset
if (process.argv.includes('--force') || process.argv.includes('-f')) {
  resetDatabase();
} else {
  console.log('⚠️  WARNING: This will delete all data in the database!');
  console.log('Usage: node reset-db.js --force');
  console.log('   or: node reset-db.js -f');
  process.exit(1);
}
