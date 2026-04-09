import { Router, Request, Response } from 'express';
import { SystemOperations } from '../db/business-adapter';

const router = Router();

// Get system information for about page
router.get('/info', async (req: Request, res: Response) => {
  try {
    // Get database info from business adapter
    const dbInfo = await SystemOperations.getDatabaseInfo();
    
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
