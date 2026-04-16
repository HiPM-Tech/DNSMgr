import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import { loadEnv } from './config/env';
import { createConnection, isDbInitialized, hasUsers } from './db/database';
import { initSchema, initSchemaAsync } from './db/schema';
import { initSchema as initSchemaWithMigration } from './db/init';
import { connect } from './db';
import { disconnect } from './db/core/connection';
import { authMiddleware, adminOnly } from './middleware/auth';
import { errorHandler, asyncHandler } from './middleware/errorHandler';
import { requestLogger, requestIdMiddleware } from './middleware/requestLogger';

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
import securityPolicyRouter from './routes/securityPolicy';
import auditRouter from './routes/audit';
import emailTemplatesRouter from './routes/emailTemplates';
import tunnelsRouter from './routes/tunnels';
import webauthnRouter from './routes/webauthn';
import tokensRouter from './routes/tokens';
import { getAuditLogs } from './service/auditExport';
import { getString, parseInteger, parsePagination, sendError, sendSuccess } from './utils/http';

// Load environment variables (data/.env has priority over root .env)
loadEnv();

import { startFailoverJob } from './service/failoverJob';
import { startWhoisJob } from './service/whoisJob';
import { initSecurityPolicyTable } from './service/securityPolicy';
import { initTrustedDevicesTable } from './service/deviceTrust';
import { log } from './lib/logger';
import { OAuthOperations } from './db/business-adapter';

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

// Content Security Policy
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Swagger setup
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DNSMgr API',
      version: '1.0.0',
      description: `DNS Aggregation Management Platform API

## Authentication

This API supports two authentication methods:

### 1. JWT Token (User Login)
After logging in via \`/api/auth/login\`, you will receive a JWT token. 
Include it in the Authorization header:
\`\`\`
Authorization: Bearer <jwt_token>
\`\`\`

### 2. API Token (Programmatic Access)
API tokens can be created from the web UI (Settings > API Tokens) and are 
suitable for automated scripts and CI/CD pipelines.

Include the API token in the Authorization header:
\`\`\`
Authorization: Bearer <api_token>
\`\`\`

API tokens have the same permissions as the user who created them and can be 
restricted to specific domains and time ranges.

### Token Permissions
- API tokens inherit the creator's role (User/Admin/Super Admin)
- Domain restrictions: Tokens can be limited to specific domains
- Time restrictions: Tokens can have start/end time limits
- All API endpoints support both JWT and API token authentication`,
    },
    servers: [{ url: `http://localhost:${PORT}` }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT or API Token',
          description: 'Enter your JWT token or API token',
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
const protectedPaths = ['/api/auth', '/api/users', '/api/teams', '/api/accounts', '/api/domains', '/api/logs', '/api/settings', '/api/tokens'];
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
app.use('/api/security', securityPolicyRouter);
app.use('/api/audit', auditRouter);
app.use('/api/email-templates', emailTemplatesRouter);
app.use('/api/tunnels', tunnelsRouter);
app.use('/api/auth/webauthn', webauthnRouter);
app.use('/api/tokens', tokensRouter);

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
// Support both development and pkg packaged executable
// In pkg, assets are accessed via __dirname (virtual filesystem)
const possiblePaths = [
  // Packaged EXE: assets are in pkg virtual filesystem at snapshot/client/dist
  path.join(__dirname, 'client/dist'),
  // Development: client/dist from server/src
  path.join(__dirname, '../../client/dist'),
  // Alternative: from server/dist
  path.join(__dirname, '../client/dist'),
  // Fallback: client folder next to executable
  path.join(process.cwd(), 'client'),
];

let clientBuildPath = '';
for (const p of possiblePaths) {
  try {
    if (require('fs').existsSync(p)) {
      clientBuildPath = p;
      console.log('✅ Serving static files from:', p);
      break;
    }
  } catch (e) {
    // Path might not be accessible in pkg snapshot
  }
}

if (clientBuildPath) {
  app.use(express.static(clientBuildPath));

  // Serve index.html for all non-API routes (SPA support)
  app.get('*', (req: Request, res: Response) => {
    // Don't interfere with API routes
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ code: 404, msg: 'API endpoint not found' });
    }
    const indexPath = path.join(clientBuildPath, 'index.html');
    if (require('fs').existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('index.html not found');
    }
  });
} else {
  console.warn('⚠️ Client build directory not found. API-only mode.');
}

// Global error handler (must be last)
app.use(errorHandler);

// Initialize database connection and check state
async function initializeApp() {
  try {
    // Try to create database connection (legacy system)
    const conn = await createConnection();

    // Initialize new database system (used by some routes like auth.ts)
    await connect();

    // Initialize schema if needed (use async version for all database types)
    await initSchemaAsync(conn);

    // Run column migration for existing tables (adds missing columns like background_image)
    await initSchemaWithMigration();

    // Check if system is initialized
    isInitialized = await checkInitialization();

    if (isInitialized) {
      log.info('Server', 'System initialized. Running in normal mode.');
      // 初始化安全相关表
      await initSecurityPolicyTable();
      await initTrustedDevicesTable();
      startFailoverJob();
      startWhoisJob();
    } else {
      log.info('Server', 'System not initialized. Running in initialization mode.');
      log.info('Server', 'Please access the setup wizard to configure the system.');
    }

    // Start server
    const server = app.listen(PORT, () => {
      log.info('Server', `DNSMgr running on http://localhost:${PORT}`);
      log.info('Server', `API Docs: http://localhost:${PORT}/api/docs`);
      if (!isInitialized) {
        log.info('Server', `Setup Wizard: http://localhost:${PORT}/setup`);
      }
    });

    // Re-check initialization status periodically (every 5 seconds)
    const initCheckInterval = setInterval(async () => {
      const newState = await checkInitialization();
        if (!isInitialized && newState) {
          // System just got initialized
          isInitialized = true;
          log.info('Server', 'System initialized detected. Normal routes are now enabled.');
          log.info('Server', 'You may need to refresh the page.');
          // 初始化安全相关表
          await initSecurityPolicyTable();
          await initTrustedDevicesTable();
          startFailoverJob();
          startWhoisJob();
        }
    }, 5000);

    // 定期清理过期的 OAuth states (每 10 分钟)
    const oauthStateCleanupInterval = setInterval(async () => {
      try {
        const deletedCount = await OAuthOperations.cleanupExpiredStates();
        if (deletedCount > 0) {
          log.debug('OAuth', `Cleaned up ${deletedCount} expired states`);
        }
      } catch (err) {
        log.error('OAuth', 'Failed to cleanup expired states', { error: err });
      }
    }, 10 * 60 * 1000);

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      clearInterval(initCheckInterval);
      clearInterval(oauthStateCleanupInterval);
      log.info('Server', 'SIGTERM received, starting graceful shutdown...');
      try {
        await disconnect();
        log.info('Server', 'Database disconnected gracefully');
      } catch (err) {
        log.error('Server', 'Error during database disconnect', { error: err });
      }
      server.close(() => {
        log.info('Server', 'Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      clearInterval(initCheckInterval);
      clearInterval(oauthStateCleanupInterval);
      log.info('Server', 'SIGINT received, starting graceful shutdown...');
      try {
        await disconnect();
        log.info('Server', 'Database disconnected gracefully');
      } catch (err) {
        log.error('Server', 'Error during database disconnect', { error: err });
      }
      server.close(() => {
        log.info('Server', 'Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    log.info('Server', 'Database not configured. Running in initialization mode.');
    log.info('Server', 'Please access the setup wizard to configure the system.');

    const server = app.listen(PORT, () => {
      log.info('Server', `DNSMgr running on http://localhost:${PORT}`);
      log.info('Server', `API Docs: http://localhost:${PORT}/api/docs`);
      log.info('Server', `Setup Wizard: http://localhost:${PORT}/setup`);
    });

    // Re-check initialization status periodically
    const initCheckInterval = setInterval(async () => {
      try {
        const conn = await createConnection();
        await connect();
        await initSchemaAsync(conn);
        const newState = await checkInitialization();
        if (newState) {
          isInitialized = true;
          clearInterval(initCheckInterval);
          // 初始化安全相关表
          await initSecurityPolicyTable();
          await initTrustedDevicesTable();
          startFailoverJob();
          startWhoisJob();
          log.info('Server', 'System initialized detected. Normal routes are now enabled.');
          log.info('Server', 'You may need to refresh the page.');
        }
      } catch {
        // Still not initialized
      }
    }, 5000);

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      clearInterval(initCheckInterval);
      log.info('Server', 'SIGTERM received, starting graceful shutdown...');
      try {
        await disconnect();
        log.info('Server', 'Database disconnected gracefully');
      } catch (err) {
        log.error('Server', 'Error during database disconnect', { error: err });
      }
      server.close(() => {
        log.info('Server', 'Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      clearInterval(initCheckInterval);
      log.info('Server', 'SIGINT received, starting graceful shutdown...');
      try {
        await disconnect();
        log.info('Server', 'Database disconnected gracefully');
      } catch (err) {
        log.error('Server', 'Error during database disconnect', { error: err });
      }
      server.close(() => {
        log.info('Server', 'Server closed');
        process.exit(0);
      });
    });
  }
}

// Start the application
initializeApp();

export default app;
