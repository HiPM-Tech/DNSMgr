import { Router, Request, Response } from 'express';
import { getCurrentConnection } from '../db/database';

const router = Router();

// Get system information for about page
router.get('/info', async (req: Request, res: Response) => {
  try {
    const conn = getCurrentConnection();
    
    let dbInfo = {
      type: 'unknown',
      version: 'unknown',
      driverVersion: 'unknown',
    };
    
    if (conn) {
      dbInfo.type = conn.type;
      
      if (conn.type === 'sqlite') {
        // Get SQLite version
        const sqliteConn = conn as any;
        const versionRow = sqliteConn.prepare('SELECT sqlite_version() as version').get();
        dbInfo.version = versionRow?.version || 'unknown';
        dbInfo.driverVersion = require('better-sqlite3/package.json').version;
      } else if (conn.type === 'mysql') {
        // Get MySQL version
        const result = await conn.get('SELECT VERSION() as version');
        dbInfo.version = (result as { version: string })?.version || 'unknown';
        dbInfo.driverVersion = require('mysql2/package.json').version;
      } else if (conn.type === 'postgresql') {
        // Get PostgreSQL version
        const result = await conn.get('SELECT version() as version');
        const fullVersion = (result as { version: string })?.version || 'unknown';
        // Extract version number from string like "PostgreSQL 15.2 on ..."
        const match = fullVersion.match(/PostgreSQL\s+(\d+\.?\d*)/);
        dbInfo.version = match ? match[1] : fullVersion;
        dbInfo.driverVersion = require('pg/package.json').version;
      }
    }
    
    // Get server package version
    const serverVersion = require('../../package.json').version;
    
    res.json({
      code: 0,
      data: {
        version: '0.1-beta',
        serverVersion,
        database: dbInfo,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: req.headers['accept-language'] || 'en',
      },
      msg: 'success',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error instanceof Error ? error.message : 'Failed to get system info',
    });
  }
});

export default router;
