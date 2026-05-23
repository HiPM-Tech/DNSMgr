import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import http from 'http';
import path from 'path';
import { loadEnv } from './config/env';

// Get the current file directory
const APP_ROOT = path.resolve();
import { createConnection, isDbInitialized, hasUsers, connect } from './db/connection';
import { initSchema } from './db/schema';
import { initSchema as initSchemaWithMigration } from './db/init';
import { disconnect } from './db/core/connection';
import { authMiddleware, adminOnly } from './middleware/auth';
import { errorHandler, asyncHandler } from './middleware/errorHandler';
import { requestLogger, requestIdMiddleware } from './middleware/requestLogger';
import { clientIPMiddleware } from './middleware/clientIP';

import authRouter from './routes/auth';
import usersRouter from './routes/users';
import teamsRouter from './routes/teams';
import accountsRouter from './routes/accounts';
import domainsRouter from './routes/domains';
import providersRouter from './routes/providers';
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
import nsMonitorRouter from './routes/ns-monitor';
import networkRouter from './routes/network';
import rdapRouter from './routes/rdap';
import { getAuditLogs } from './service/auditExport';
import { getString, parseInteger, parsePagination, sendError, sendSuccess } from './utils/http';

// Load environment variables (data/.env has priority over root .env)
loadEnv();

import { startFailoverJob } from './service/failoverJob';
import { startWhoisJob } from './service/whois';
import { startNsMonitorJob } from './service/nsMonitorJob';
import { startDomainRenewalJob } from './service/domainRenewalJob';
import { startRecordCountCacheRefresh } from './service/recordCountCache';
import { startDomainSyncJob } from './service/domainSyncJob';

// 读取 package.json 获取版本信息
import { readFileSync } from 'fs';
let packageVersion = 'unknown';
try {
  const packageJson = JSON.parse(readFileSync(path.join(APP_ROOT, 'package.json'), 'utf-8'));
  packageVersion = packageJson.version || 'unknown';
} catch (error) {
  // 忽略错误，使用默认版本
}

/**
 * 打印启动横幅
 */
function printBanner(port: number): void {
  // Use named constants for better maintainability
  const CYAN = '\x1b[36m';
  const MAGENTA = '\x1b[35m';
  const GRAY = '\x1b[90m';
  const RESET = '\x1b[0m';
  const BOLD = '\x1b[1m';
  
  const banner = `
${CYAN}╔═══════════════════════════════════════════════════════════╗${RESET}
${CYAN}║${RESET}                                                       ${CYAN}║${RESET}
${CYAN}║${RESET}   ${BOLD}${MAGENTA}HiDNS Manager${RESET}                                    ${CYAN}║${RESET}
${CYAN}║${RESET}                                                       ${CYAN}║${RESET}
${CYAN}║${RESET}   ${GRAY}Project:${RESET} HiDNS Manager                         ${CYAN}║${RESET}
${CYAN}║${RESET}   ${GRAY}Version:${RESET} ${packageVersion.padEnd(42)}${CYAN}║${RESET}
${CYAN}║${RESET}   ${GRAY}GitHub:${RESET}  https://github.com/HiPM-Tech/HiDNS    ${CYAN}║${RESET}
${CYAN}║${RESET}                                                       ${CYAN}║${RESET}
${CYAN}╚═══════════════════════════════════════════════════════════╝${RESET}
`;
  console.log(banner);
}
import { initRenewalSchedulers } from './service/renewalInit';
import { wsService } from './service/websocket';
import { initWhoisSchedulers } from './service/whois';
import { initSecurityPolicyTable } from './service/securityPolicy';
import { initTrustedDevicesTable } from './service/deviceTrust';
import { log } from './lib/logger';
import { OAuthOperations } from './db/business-adapter';

const app = express();

// Server instance for graceful shutdown
let server: http.Server | null = null;

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
app.use(clientIPMiddleware); // 必须在 requestLogger 之前，确保日志记录真实 IP
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
      title: 'HiDNS API',
      version: '1.0.0',
      description: `HiDNS - DNS Aggregation Management Platform API

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
    servers: [
      {
        url: process.env.API_BASE_URL || `http://localhost:${PORT}`,
        description: process.env.API_BASE_URL ? 'Custom API URL' : 'Local development',
      },
    ],
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
app.use('/api/providers', providersRouter);
app.use('/api/domains/:domainId/records', recordsRouter);
app.use('/api/rdap', rdapRouter);
app.use('/api/system', systemRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/security', securityRouter);
app.use('/api/security', securityPolicyRouter);
app.use('/api/audit', auditRouter);
app.use('/api/email-templates', emailTemplatesRouter);
app.use('/api/tunnels', tunnelsRouter);
app.use('/api/auth/webauthn', webauthnRouter);
app.use('/api/tokens', tokensRouter);
app.use('/api/ns-monitor', nsMonitorRouter);
app.use('/api/network', networkRouter);

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
// Support both development and packaged executable
const possiblePaths = [
  // Packaged: assets are in APP_ROOT/client/dist
  path.join(APP_ROOT, 'client/dist'),
  // Development: client/dist from server/src
  path.join(APP_ROOT, '../../client/dist'),
  // Alternative: from server/dist
  path.join(APP_ROOT, '../client/dist'),
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

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(
  signal: string,
  initCheckInterval?: NodeJS.Timeout,
  oauthStateCleanupInterval?: NodeJS.Timeout
): Promise<void> {
  if (initCheckInterval) clearInterval(initCheckInterval);
  if (oauthStateCleanupInterval) clearInterval(oauthStateCleanupInterval);
  
  log.info('Server', `${signal} received, starting graceful shutdown...`);
  
  // Shutdown WebSocket service
  wsService.shutdown();
  
  try {
    await disconnect();
    log.info('Server', 'Database disconnected gracefully');
  } catch (err) {
    log.error('Server', 'Error during database disconnect', { error: err });
  }
  
  if (server) {
    server.close(() => {
      log.info('Server', 'Server closed');
      process.exit(0);
    });
  } else {
    log.info('Server', 'No server instance to close');
    process.exit(0);
  }
}

// Initialize database connection and check state
async function initializeApp() {
  try {
    // Initialize new database system (unified connection)
    await connect();

    // Run unified schema initialization and migration checks
    // This function internally calls initSchemaAsync() if needed
    await initSchemaWithMigration();

    // Check if system is initialized
    isInitialized = await checkInitialization();

    if (isInitialized) {
      log.info('Server', 'System initialized. Running in normal mode.');
      // 初始化安全相关表
      await initSecurityPolicyTable();
      await initTrustedDevicesTable();
      
      // 初始化续期和 WHOIS 调度器
      initRenewalSchedulers();
      initWhoisSchedulers();
      
      startFailoverJob();
      startWhoisJob();
      startNsMonitorJob();
      startDomainRenewalJob();
      startRecordCountCacheRefresh(30); // Refresh every 30 minutes
      startDomainSyncJob(0.5); // Sync every 30 minutes
    } else {
      log.info('Server', 'System not initialized. Running in initialization mode.');
      log.info('Server', 'Please access the setup wizard to configure the system.');
    }

    // Start server with WebSocket support
    server = http.createServer(app);
    
    // Initialize WebSocket service
    wsService.initialize(server);
    
    // 打印启动横幅
    printBanner(PORT);
    
    server.listen(PORT, () => {
      log.info('Server', `HiDNS running on http://localhost:${PORT}`);
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
          startNsMonitorJob();
          startDomainRenewalJob();
          startRecordCountCacheRefresh(30); // Refresh every 30 minutes
          startDomainSyncJob(0.5); // Sync every 30 minutes
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
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM', initCheckInterval, oauthStateCleanupInterval));
    process.on('SIGINT', () => gracefulShutdown('SIGINT', initCheckInterval, oauthStateCleanupInterval));

  } catch (error) {
    log.info('Server', 'Database not configured. Running in initialization mode.');
    log.info('Server', 'Please access the setup wizard to configure the system.');

    server = http.createServer(app);
    
    // Initialize WebSocket service
    wsService.initialize(server);
    
    // 打印启动横幅
    printBanner(PORT);
    
    server.listen(PORT, () => {
      log.info('Server', `HiDNS running on http://localhost:${PORT}`);
      log.info('Server', `API Docs: http://localhost:${PORT}/api/docs`);
      log.info('Server', `Setup Wizard: http://localhost:${PORT}/setup`);
    });

    // Re-check initialization status periodically
    const initCheckInterval = setInterval(async () => {
      try {
        await connect();
        await initSchemaWithMigration();
        const newState = await checkInitialization();
        if (newState) {
          isInitialized = true;
          clearInterval(initCheckInterval);
          // 初始化安全相关表
          await initSecurityPolicyTable();
          await initTrustedDevicesTable();
          startFailoverJob();
          startWhoisJob();
          startNsMonitorJob();
          startDomainRenewalJob();
          startRecordCountCacheRefresh(30); // Refresh every 30 minutes
          startDomainSyncJob(0.5); // Sync every 30 minutes
          log.info('Server', 'System initialized detected. Normal routes are now enabled.');
          log.info('Server', 'You may need to refresh the page.');
        }
      } catch {
        // Still not initialized
      }
    }, 5000);

    // Graceful shutdown - use the unified gracefulShutdown function
    // Note: oauthStateCleanupInterval is not started in this branch, so pass undefined
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM', initCheckInterval));
    process.on('SIGINT', () => gracefulShutdown('SIGINT', initCheckInterval));
  }
}

// Start the application
initializeApp();

export default app;
