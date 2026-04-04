import express, { Request, Response } from 'express';
import cors from 'cors';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { initSchema } from './db/schema';
import { authMiddleware, adminOnly } from './middleware/auth';
import { getDb, isDbInitialized, hasUsers } from './db';

import authRouter from './routes/auth';
import usersRouter from './routes/users';
import teamsRouter from './routes/teams';
import accountsRouter from './routes/accounts';
import domainsRouter from './routes/domains';
import recordsRouter from './routes/records';
import initRouter from './routes/init';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Global state to track initialization
let isInitialized = false;

function checkInitialization(): boolean {
  return isDbInitialized() && hasUsers();
}

// Middlewares
app.use(cors());
app.use(express.json());

// Swagger setup
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DNSMgr API',
      version: '1.0.0',
      description: 'DNS Aggregation Management Platform API',
    },
    servers: [{ url: `http://localhost:${PORT}` }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/routes/*.ts', './dist/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Initialize routes - always available
app.use('/api/init', initRouter);

// Check initial state
isInitialized = checkInitialization();

if (isInitialized) {
  console.log('[Server] System initialized. Running in normal mode.');
  enableNormalRoutes();
} else {
  console.log('[Server] System not initialized. Running in initialization mode.');
  console.log('[Server] Please access the setup wizard to configure the system.');
  enableInitMode();
}

// Re-check initialization status periodically (every 5 seconds)
const initCheckInterval = setInterval(() => {
  const newState = checkInitialization();
  if (!isInitialized && newState) {
    // System just got initialized
    isInitialized = true;
    console.log('[Server] System initialized detected. Enabling normal routes...');
    enableNormalRoutes();
    console.log('[Server] Normal routes enabled. You may need to refresh the page.');
  }
}, 5000);

function enableInitMode() {
  // In init mode, return 503 for protected routes
  const protectedPaths = ['/api/auth', '/api/users', '/api/teams', '/api/accounts', '/api/domains', '/api/logs'];
  
  protectedPaths.forEach(path => {
    app.use(path, (req: Request, res: Response) => {
      res.status(503).json({ 
        code: 503, 
        msg: 'System not initialized. Please complete setup first.',
        data: { needsInit: true }
      });
    });
  });
}

function enableNormalRoutes() {
  // Routes
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/teams', teamsRouter);
  app.use('/api/accounts', accountsRouter);
  app.use('/api/domains', domainsRouter);
  app.use('/api/domains/:domainId/records', recordsRouter);

  // Logs route
  /**
   * @swagger
   * /api/logs:
   *   get:
   *     summary: Get operation logs (admin only)
   *     tags: [Logs]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *       - in: query
   *         name: pageSize
   *         schema:
   *           type: integer
   *       - in: query
   *         name: domain
   *         schema:
   *           type: string
   *       - in: query
   *         name: userId
   *         schema:
   *           type: integer
   *       - in: query
   *         name: action
   *         schema:
   *           type: string
   *       - in: query
   *         name: startDate
   *         schema:
   *           type: string
   *           example: 2026-04-01
   *       - in: query
   *         name: endDate
   *         schema:
   *           type: string
   *           example: 2026-04-04
   *     responses:
   *       200:
   *         description: Operation logs
   */
  app.get('/api/logs', authMiddleware, adminOnly, (req: Request, res: Response) => {
    const { page = '1', pageSize = '50', domain, userId, action, startDate, endDate } = req.query as Record<string, string>;
    const pageNum = parseInt(page);
    const size = parseInt(pageSize);
    const offset = (pageNum - 1) * size;
    const db = getDb();
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    if (domain) { conditions.push('l.domain LIKE ?'); params.push(`%${domain}%`); }
    if (userId) { conditions.push('l.user_id = ?'); params.push(parseInt(userId)); }
    if (action) { conditions.push('l.action = ?'); params.push(action); }
    if (startDate) { conditions.push("date(l.created_at) >= date(?)"); params.push(startDate); }
    if (endDate) { conditions.push("date(l.created_at) <= date(?)"); params.push(endDate); }
    const where = conditions.join(' AND ');
    const total = (db.prepare(`SELECT COUNT(*) as cnt FROM operation_logs l WHERE ${where}`).get(...params) as { cnt: number }).cnt;
    const list = db.prepare(
      `SELECT l.*, u.username, u.nickname
       FROM operation_logs l
       LEFT JOIN users u ON u.id = l.user_id
       WHERE ${where}
       ORDER BY l.id DESC
       LIMIT ? OFFSET ?`
    ).all(...params, size, offset);
    res.json({ code: 0, data: { total, list }, msg: 'success' });
  });
}

// Initialize DB schema (creates tables but not admin user)
initSchema();

const server = app.listen(PORT, () => {
  console.log(`[Server] DNSMgr running on http://localhost:${PORT}`);
  console.log(`[Server] API Docs: http://localhost:${PORT}/api/docs`);
  if (!isInitialized) {
    console.log(`[Server] Setup Wizard: http://localhost:${PORT}/setup`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  clearInterval(initCheckInterval);
  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  clearInterval(initCheckInterval);
  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});

export default app;
