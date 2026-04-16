import { Router, Request, Response } from 'express';
import { DnsAccountOperations, TeamOperations } from '../db/business-adapter';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { createAdapter, getProvider, getProviders, isStubProvider } from '../lib/dns/DnsHelper';
import { DnsAccount } from '../types';
import { normalizeProviderType } from '../lib/dns/providerAlias';
import { isAdmin, isSuper, normalizeRole, ROLE_ADMIN } from '../utils/roles';
import { parseInteger, sendError, sendSuccess, sendServerError } from '../utils/http';

const router = Router();

async function canReadAccount(account: DnsAccount, userId: number, role: number): Promise<boolean> {
  if (isSuper(role)) return true;
  if (account.created_by === userId) return true;
  if (account.team_id) {
    return await TeamOperations.isMember(account.team_id, userId);
  }
  return false;
}

function canManageAccount(account: DnsAccount, userId: number, role: number): boolean {
  if (isSuper(role)) return true;
  return role >= ROLE_ADMIN && account.created_by === userId;
}

/**
 * @swagger
 * /api/accounts/providers:
 *   get:
 *     summary: List available provider types with their config fields
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Provider list
 */
router.get('/providers', authMiddleware, (_req: Request, res: Response) => {
  sendSuccess(res, getProviders());
});

/**
 * @swagger
 * /api/accounts:
 *   get:
 *     summary: List DNS provider accounts
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of accounts
 */
router.get('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  let accounts: DnsAccount[];
  if (isSuper(req.user!.role)) {
    accounts = await DnsAccountOperations.getAll() as unknown as DnsAccount[];
  } else {
    const userId = req.user!.userId;
    const teams = await TeamOperations.getByUserId(userId);
    const teamIds = teams.map(r => r.id as number);
    accounts = await DnsAccountOperations.getAccessibleByUserId(userId, teamIds) as unknown as DnsAccount[];
  }
  // Mask config secrets
  const safe = accounts.map(a => {
    // MySQL JSON type returns object directly, SQLite/PostgreSQL returns string
    const cfg = typeof a.config === 'string' ? JSON.parse(a.config) as Record<string, string> : a.config as Record<string, string>;
    const masked: Record<string, string> = {};
    for (const k of Object.keys(cfg)) masked[k] = '***';
    return { ...a, type: normalizeProviderType(a.type), config: masked };
  });
  sendSuccess(res, safe);
}));

/**
 * @swagger
 * /api/accounts:
 *   post:
 *     summary: Add a DNS account (validates credentials)
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, name, config]
 *             properties:
 *               type:
 *                 type: string
 *               name:
 *                 type: string
 *               config:
 *                 type: object
 *               remark:
 *                 type: string
 *               team_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Account created
 */
router.post('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  if (!isAdmin(req.user?.role)) {
    sendError(res, 'Permission denied');
    return;
  }
  const { type, name, config, remark = '', team_id } = req.body as {
    type: string; name: string; config: Record<string, string>; remark?: string; team_id?: number;
  };
  const normalizedType = normalizeProviderType(type ?? '');
  if (!normalizedType || !name || !config) {
    sendError(res, 'type, name, and config are required');
    return;
  }
  if (!getProvider(normalizedType)) {
    sendError(res, `Unknown provider type: ${type}`);
    return;
  }
  if (isStubProvider(normalizedType)) {
    sendError(res, 'Provider is a stub and cannot be added');
    return;
  }
  try {
    const dnsAdapter = createAdapter(normalizedType, config);
    const ok = await dnsAdapter.check();
    if (!ok) {
      sendError(res, `Credential check failed: ${dnsAdapter.getError()}`);
      return;
    }
  } catch (e) {
    sendError(res, `Provider error: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  const id = await DnsAccountOperations.create({
    type: normalizedType,
    name,
    config: JSON.stringify(config),
    remark,
    created_by: req.user!.userId,
    team_id: team_id ?? null
  });
  sendSuccess(res, { id });
}));

/**
 * @swagger
 * /api/accounts/{id}:
 *   get:
 *     summary: Get account info
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Account info
 */
router.get('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = parseInteger(req.params.id) ?? 0;
  const account = await DnsAccountOperations.getById(id) as DnsAccount | undefined;
  if (!account || !(await canReadAccount(account, req.user!.userId, normalizeRole(req.user?.role)))) {
    sendError(res, 'Account not found');
    return;
  }
  // MySQL JSON type returns object directly, SQLite/PostgreSQL returns string
  const cfg = typeof account.config === 'string' ? JSON.parse(account.config) as Record<string, string> : account.config as Record<string, string>;
  const masked: Record<string, string> = {};
  for (const k of Object.keys(cfg)) masked[k] = '***';
  sendSuccess(res, { ...account, type: normalizeProviderType(account.type), config: masked });
}));

/**
 * @swagger
 * /api/accounts/{id}:
 *   put:
 *     summary: Update account
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               config:
 *                 type: object
 *               remark:
 *                 type: string
 *               team_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Account updated
 */
router.put('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = parseInteger(req.params.id) ?? 0;
  const account = await DnsAccountOperations.getById(id) as DnsAccount | undefined;
  if (!account || !canManageAccount(account, req.user!.userId, normalizeRole(req.user?.role))) {
    sendError(res, 'Account not found');
    return;
  }
  const { type, name, config, remark, team_id } = req.body as {
    type?: string; name?: string; config?: Record<string, string>; remark?: string; team_id?: number | null;
  };
  const normalizedType = type !== undefined ? normalizeProviderType(type) : undefined;
  if (normalizedType !== undefined) {
    if (!getProvider(normalizedType)) {
      sendError(res, `Unknown provider type: ${type}`);
      return;
    }
    if (isStubProvider(normalizedType)) {
      sendError(res, 'Provider is a stub and cannot be used');
      return;
    }
  }
  if (config) {
    try {
      const dnsAdapter = createAdapter(normalizedType ?? normalizeProviderType(account.type), config);
      const ok = await dnsAdapter.check();
      if (!ok) {
        sendError(res, `Credential check failed: ${dnsAdapter.getError()}`);
        return;
      }
    } catch (e) {
      sendError(res, `Provider error: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
  }
  const updates: Record<string, unknown> = {};
  if (normalizedType !== undefined) updates.type = normalizedType;
  if (name !== undefined) updates.name = name;
  if (config !== undefined) updates.config = JSON.stringify(config);
  if (remark !== undefined) updates.remark = remark;
  if (team_id !== undefined) updates.team_id = team_id;
  
  if (Object.keys(updates).length === 0) {
    sendSuccess(res);
    return;
  }
  
  await DnsAccountOperations.update(id, updates);
  sendSuccess(res);
}));

/**
 * @swagger
 * /api/accounts/{id}:
 *   delete:
 *     summary: Delete account
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Account deleted
 */
router.delete('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = parseInteger(req.params.id) ?? 0;
  const account = await DnsAccountOperations.getById(id) as DnsAccount | undefined;
  if (!account || !canManageAccount(account, req.user!.userId, normalizeRole(req.user?.role))) {
    sendError(res, 'Account not found');
    return;
  }
  await DnsAccountOperations.delete(id);
  sendSuccess(res);
}));

export default router;
