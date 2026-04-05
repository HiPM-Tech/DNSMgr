import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import { loadEnv } from './config/env';
import { createConnection, isDbInitialized, hasUsers } from './db/database';
import { initSchema, initSchemaAsync } from './db/schema';
import { authMiddleware, adminOnly } from './middleware/auth';
import { errorHandler, asyncHandler } from './middleware/errorHandler';
import { requestLogger, requestIdMiddleware } from './middleware/requestLogger';
import { globalLimiter, loginLimiter, registerLimiter, emailLimiter } from './middleware/rateLimit';

import authRouter from './routes/auth';
import usersRouter from './routes/users';
import teamsRouter from './routes/teams';
import accountsRouter from './routes/accounts';
import domainsRouter from './routes/domains';
import recordsRouter from './routes/records';
import initRouter from './routes/init';
import systemRouter from './routes/system';
import settingsRouter from './routes/settings';
import securityRouter from './routes/security';
import auditRouter from './routes/audit';
import emailTemplatesRouter from './routes/emailTemplates';
import tunnelsRouter from './routes/tunnels';
import webauthnRouter from './routes/webauthn';
import { getAuditLogs } from './service/auditExport';
import { getString, parseInteger, parsePagination, sendError, sendSuccess } from './utils/http';

// Load environment variables (data/.env has priority over root .env)
loadEnv();

import { startFailoverJob } from './service/failoverJob';
import { startWhoisJob } from './service/whoisJob';

const app = express();

const PORT = parseInt(process.env.PORT || '3001', 10);

// Global state to track initialization
let isInitialized = false;

async function checkInitialization(): Promise<boolean> {
  return await isDbInitialized() && await hasUsers();
}

// Middlewares
app.use(cors());
app.use(express.json());
app.use(requestIdMiddleware);
app.use(requestLogger);
app.use(globalLimiter);

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

// Middleware to check initialization status for protected routes
function initCheckMiddleware(req: Request, res: Response, next: NextFunction) {
  if (isInitialized) {
    return next();
  }
  // Return 503 if not initialized
  res.status(503).json({
    code: 503,
    msg: 'System not initialized. Please complete setup first.',
    data: { needsInit: true }
  });
}

// Apply initialization check middleware to protected paths
const protectedPaths = ['/api/auth', '/api/users', '/api/teams', '/api/accounts', '/api/domains', '/api/logs', '/api/settings'];
protectedPaths.forEach(path => {
  app.use(path, initCheckMiddleware);
});

// Routes - these will only be accessible if isInitialized is true
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/domains', domainsRouter);
app.use('/api/domains/:domainId/records', recordsRouter);
app.use('/api/system', systemRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/security', securityRouter);
app.use('/api/audit', auditRouter);
app.use('/api/email-templates', emailTemplatesRouter);
app.use('/api/tunnels', tunnelsRouter);
app.use('/api/auth/webauthn', webauthnRouter);

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
app.get('/api/logs', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const { page, pageSize } = parsePagination(req.query, { defaultPageSize: 50, maxPageSize: 200 });
    const { total, logs } = await getAuditLogs(page, pageSize, {
      domain: getString(req.query.domain),
      userId: parseInteger(req.query.userId),
      action: getString(req.query.action),
      startDate: getString(req.query.startDate),
      endDate: getString(req.query.endDate),
    });

    sendSuccess(res, {
      total,
      list: logs.map((log) => ({
        id: log.id,
        user_id: log.userId,
        username: log.username,
        nickname: log.nickname,
        action: log.action,
        domain: log.domain,
        data: JSON.stringify(log.data),
        created_at: log.createdAt,
      })),
    });
  } catch (error) {
    sendError(res, error instanceof Error ? error.message : 'Failed to fetch logs', 500);
  }
});

// Serve static files from client build directory
const clientBuildPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientBuildPath));

// Serve index.html for all non-API routes (SPA support)
app.get('*', (req: Request, res: Response) => {
  // Don't interfere with API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ code: 404, msg: 'API endpoint not found' });
  }
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Global error handler (must be last)
app.use(errorHandler);

// Initialize database connection and check state
async function initializeApp() {
  try {
    // Try to create database connection
    const conn = await createConnection();

    // Initialize schema if needed (use async version for all database types)
    await initSchemaAsync(conn);

    // Check if system is initialized
    isInitialized = await checkInitialization();

    if (isInitialized) {
      console.log('[Server] System initialized. Running in normal mode.');
      startFailoverJob();
      startWhoisJob();
    } else {
      console.log('[Server] System not initialized. Running in initialization mode.');
      console.log('[Server] Please access the setup wizard to configure the system.');
    }

    // Start server
    const server = app.listen(PORT, () => {
      console.log(`[Server] DNSMgr running on http://localhost:${PORT}`);
      console.log(`[Server] API Docs: http://localhost:${PORT}/api/docs`);
      if (!isInitialized) {
        console.log(`[Server] Setup Wizard: http://localhost:${PORT}/setup`);
      }
    });

    // Re-check initialization status periodically (every 5 seconds)
    const initCheckInterval = setInterval(async () => {
      const newState = await checkInitialization();
      if (!isInitialized && newState) {
        // System just got initialized
        isInitialized = true;
        console.log('[Server] System initialized detected. Normal routes are now enabled.');
        console.log('[Server] You may need to refresh the page.');
        startFailoverJob();
        startWhoisJob();
      }
    }, 5000);

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

  } catch (error) {
    console.log('[Server] Database not configured. Running in initialization mode.');
    console.log('[Server] Please access the setup wizard to configure the system.');

    const server = app.listen(PORT, () => {
      console.log(`[Server] DNSMgr running on http://localhost:${PORT}`);
      console.log(`[Server] API Docs: http://localhost:${PORT}/api/docs`);
      console.log(`[Server] Setup Wizard: http://localhost:${PORT}/setup`);
    });

    // Re-check initialization status periodically
    const initCheckInterval = setInterval(async () => {
      try {
        const conn = await createConnection();
        await initSchemaAsync(conn);
        const newState = await checkInitialization();
        if (newState) {
          isInitialized = true;
          clearInterval(initCheckInterval);
          startFailoverJob();
          startWhoisJob();
          console.log('[Server] System initialized detected. Normal routes are now enabled.');
          console.log('[Server] You may need to refresh the page.');
        }
      } catch {
        // Still not initialized
      }
    }, 5000);

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
  }
}

// Start the application
initializeApp();

export default app;
