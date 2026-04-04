import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { createAdapter, getProviders, isStubProvider } from '../lib/dns/DnsHelper';
import { DnsAccount } from '../types';
import { isAdmin, isSuper, normalizeRole, ROLE_ADMIN } from '../utils/roles';

const router = Router();

function canReadAccount(account: DnsAccount, userId: number, role: number): boolean {
  if (isSuper(role)) return true;
  if (account.created_by === userId) return true;
  if (account.team_id) {
    const db = getDb();
    const membership = db.prepare('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?').get(account.team_id, userId);
    if (membership) return true;
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
  res.json({ code: 0, data: getProviders(), msg: 'success' });
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
router.get('/', authMiddleware, (req: Request, res: Response) => {
  const db = getDb();
  let accounts: DnsAccount[];
  if (isSuper(req.user!.role)) {
    accounts = db.prepare('SELECT * FROM dns_accounts ORDER BY id').all() as DnsAccount[];
  } else {
    const userId = req.user!.userId;
    const teamIds = (db.prepare('SELECT team_id FROM team_members WHERE user_id = ?').all(userId) as { team_id: number }[]).map(r => r.team_id);
    if (teamIds.length > 0) {
      const placeholders = teamIds.map(() => '?').join(',');
      accounts = db.prepare(
        `SELECT * FROM dns_accounts WHERE created_by = ? OR team_id IN (${placeholders}) ORDER BY id`
      ).all(userId, ...teamIds) as DnsAccount[];
    } else {
      accounts = db.prepare('SELECT * FROM dns_accounts WHERE created_by = ? ORDER BY id').all(userId) as DnsAccount[];
    }
  }
  // Mask config secrets
  const safe = accounts.map(a => {
    const cfg = JSON.parse(a.config) as Record<string, string>;
    const masked: Record<string, string> = {};
    for (const k of Object.keys(cfg)) masked[k] = '***';
    return { ...a, config: masked };
  });
  res.json({ code: 0, data: safe, msg: 'success' });
});

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
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  if (!isAdmin(req.user?.role)) {
    res.json({ code: -1, msg: 'Permission denied' });
    return;
  }
  const { type, name, config, remark = '', team_id } = req.body as {
    type: string; name: string; config: Record<string, string>; remark?: string; team_id?: number;
  };
  if (!type || !name || !config) {
    res.json({ code: -1, msg: 'type, name, and config are required' });
    return;
  }
  if (isStubProvider(type)) {
    res.json({ code: -1, msg: 'Provider is a stub and cannot be added' });
    return;
  }
  try {
    const adapter = createAdapter(type, config);
    const ok = await adapter.check();
    if (!ok) {
      res.json({ code: -1, msg: `Credential check failed: ${adapter.getError()}` });
      return;
    }
  } catch (e) {
    res.json({ code: -1, msg: `Provider error: ${e instanceof Error ? e.message : String(e)}` });
    return;
  }
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO dns_accounts (type, name, config, remark, created_by, team_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(type, name, JSON.stringify(config), remark, req.user!.userId, team_id ?? null);
  res.json({ code: 0, data: { id: result.lastInsertRowid }, msg: 'success' });
});

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
router.get('/:id', authMiddleware, (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const account = db.prepare('SELECT * FROM dns_accounts WHERE id = ?').get(id) as DnsAccount | undefined;
  if (!account || !canReadAccount(account, req.user!.userId, normalizeRole(req.user?.role))) {
    res.json({ code: -1, msg: 'Account not found' });
    return;
  }
  const cfg = JSON.parse(account.config) as Record<string, string>;
  const masked: Record<string, string> = {};
  for (const k of Object.keys(cfg)) masked[k] = '***';
  res.json({ code: 0, data: { ...account, config: masked }, msg: 'success' });
});

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
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const account = db.prepare('SELECT * FROM dns_accounts WHERE id = ?').get(id) as DnsAccount | undefined;
  if (!account || !canManageAccount(account, req.user!.userId, normalizeRole(req.user?.role))) {
    res.json({ code: -1, msg: 'Account not found' });
    return;
  }
  const { name, config, remark, team_id } = req.body as {
    name?: string; config?: Record<string, string>; remark?: string; team_id?: number | null;
  };
  if (config) {
    try {
      const adapter = createAdapter(account.type, config);
      const ok = await adapter.check();
      if (!ok) {
        res.json({ code: -1, msg: `Credential check failed: ${adapter.getError()}` });
        return;
      }
    } catch (e) {
      res.json({ code: -1, msg: `Provider error: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
  }
  const updates: string[] = [];
  const params: unknown[] = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (config !== undefined) { updates.push('config = ?'); params.push(JSON.stringify(config)); }
  if (remark !== undefined) { updates.push('remark = ?'); params.push(remark); }
  if (team_id !== undefined) { updates.push('team_id = ?'); params.push(team_id); }
  if (updates.length === 0) {
    res.json({ code: 0, msg: 'success' });
    return;
  }
  params.push(id);
  db.prepare(`UPDATE dns_accounts SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ code: 0, msg: 'success' });
});

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
router.delete('/:id', authMiddleware, (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const account = db.prepare('SELECT * FROM dns_accounts WHERE id = ?').get(id) as DnsAccount | undefined;
  if (!account || !canManageAccount(account, req.user!.userId, normalizeRole(req.user?.role))) {
    res.json({ code: -1, msg: 'Account not found' });
    return;
  }
  db.prepare('DELETE FROM dns_accounts WHERE id = ?').run(id);
  res.json({ code: 0, msg: 'success' });
});

export default router;
