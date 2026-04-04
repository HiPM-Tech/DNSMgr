import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { createAdapter } from '../lib/dns/DnsHelper';
import { DnsAccount, Domain } from '../types';

const router = Router();

function getAccountForUser(accountId: number, userId: number, role: string): DnsAccount | null {
  const db = getDb();
  const account = db.prepare('SELECT * FROM dns_accounts WHERE id = ?').get(accountId) as DnsAccount | undefined;
  if (!account) return null;
  if (role === 'admin' || account.created_by === userId) return account;
  if (account.team_id) {
    const membership = db.prepare('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?').get(account.team_id, userId);
    if (membership) return account;
  }
  return null;
}

function canAccessDomain(domainId: number, userId: number, role: string): Domain | null {
  const db = getDb();
  const domain = db.prepare('SELECT * FROM domains WHERE id = ?').get(domainId) as Domain | undefined;
  if (!domain) return null;
  if (role === 'admin') return domain;
  const account = getAccountForUser(domain.account_id, userId, role);
  if (account) return domain;
  const perm = db.prepare('SELECT id FROM domain_permissions WHERE domain_id = ? AND user_id = ?').get(domainId, userId);
  if (perm) return domain;
  const teamIds = (db.prepare('SELECT team_id FROM team_members WHERE user_id = ?').all(userId) as { team_id: number }[]).map(r => r.team_id);
  if (teamIds.length > 0) {
    const placeholders = teamIds.map(() => '?').join(',');
    const teamPerm = db.prepare(`SELECT id FROM domain_permissions WHERE domain_id = ? AND team_id IN (${placeholders})`).get(domainId, ...teamIds);
    if (teamPerm) return domain;
  }
  return null;
}

/**
 * @swagger
 * /api/domains:
 *   get:
 *     summary: List domains
 *     tags: [Domains]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: account_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of domains
 */
router.get('/', authMiddleware, (req: Request, res: Response) => {
  const db = getDb();
  const { account_id, keyword } = req.query as { account_id?: string; keyword?: string };
  const userId = req.user!.userId;
  const role = req.user!.role;

  let query = 'SELECT d.* FROM domains d';
  const params: unknown[] = [];

  if (role !== 'admin') {
    const teamIds = (db.prepare('SELECT team_id FROM team_members WHERE user_id = ?').all(userId) as { team_id: number }[]).map(r => r.team_id);
    const teamFilter = teamIds.length > 0 ? `OR team_id IN (${teamIds.map(() => '?').join(',')})` : '';
    const teamPermFilter = teamIds.length > 0 ? `OR team_id IN (${teamIds.map(() => '?').join(',')})` : '';
    query += ` WHERE (d.account_id IN (
        SELECT id FROM dns_accounts WHERE created_by = ?
        ${teamFilter}
      ) OR d.id IN (
        SELECT domain_id FROM domain_permissions WHERE user_id = ?
        ${teamPermFilter}
      ))`;
    params.push(userId, ...teamIds, userId, ...teamIds);
  } else {
    query += ' WHERE 1=1';
  }

  if (account_id) { query += ' AND d.account_id = ?'; params.push(parseInt(account_id)); }
  if (keyword) { query += ' AND d.name LIKE ?'; params.push(`%${keyword}%`); }
  query += ' ORDER BY d.id';

  const domains = db.prepare(query).all(...params);
  res.json({ code: 0, data: domains, msg: 'success' });
});

/**
 * @swagger
 * /api/domains:
 *   post:
 *     summary: Add a domain
 *     tags: [Domains]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [account_id, name]
 *             properties:
 *               account_id:
 *                 type: integer
 *               name:
 *                 type: string
 *               third_id:
 *                 type: string
 *               remark:
 *                 type: string
 *     responses:
 *       200:
 *         description: Domain added
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const { account_id, name, third_id = '', remark = '' } = req.body as {
    account_id: number; name: string; third_id?: string; remark?: string;
  };
  const normalizedName = name?.trim() ?? '';
  const normalizedThirdId = third_id?.trim() ?? '';
  if (!account_id || !normalizedName) {
    res.json({ code: -1, msg: 'account_id and name are required' });
    return;
  }
  const account = getAccountForUser(account_id, req.user!.userId, req.user!.role);
  if (!account) {
    res.json({ code: -1, msg: 'Account not found or access denied' });
    return;
  }
  const db = getDb();
  // Use a single atomic statement to prevent duplicate insertion under concurrent requests.
  const result = db.prepare(
    `INSERT INTO domains (account_id, name, third_id, remark)
     SELECT ?, ?, ?, ?
     WHERE NOT EXISTS (
       SELECT 1 FROM domains
       WHERE account_id = ?
         AND (LOWER(name) = LOWER(?) OR (? <> '' AND third_id = ?))
     )`
  ).run(
    account_id,
    normalizedName,
    normalizedThirdId,
    remark,
    account_id,
    normalizedName,
    normalizedThirdId,
    normalizedThirdId,
  );
  if (result.changes === 0) {
    res.json({ code: -1, msg: 'Domain already exists in this account' });
    return;
  }
  res.json({ code: 0, data: { id: result.lastInsertRowid }, msg: 'success' });
});

/**
 * @swagger
 * /api/domains/sync:
 *   post:
 *     summary: Sync domains from provider
 *     tags: [Domains]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [account_id]
 *             properties:
 *               account_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Sync result
 */
router.post('/sync', authMiddleware, async (req: Request, res: Response) => {
  const { account_id } = req.body as { account_id: number };
  if (!account_id) {
    res.json({ code: -1, msg: 'account_id is required' });
    return;
  }
  const account = getAccountForUser(account_id, req.user!.userId, req.user!.role);
  if (!account) {
    res.json({ code: -1, msg: 'Account not found or access denied' });
    return;
  }
  try {
    const cfg = JSON.parse(account.config) as Record<string, string>;
    const adapter = createAdapter(account.type, cfg);
    const result = await adapter.getDomainList();
    const db = getDb();
    let added = 0;
    for (const d of result.list) {
      const domainName = d.Domain?.trim() ?? '';
      const providerThirdId = d.ThirdId?.trim() ?? '';
      if (!domainName) continue;
      const existing = db.prepare(
        `SELECT id FROM domains
         WHERE account_id = ?
           AND (LOWER(name) = LOWER(?) OR (? <> '' AND third_id = ?))`
      ).get(account_id, domainName, providerThirdId, providerThirdId) as { id: number } | undefined;
      if (!existing) {
        db.prepare('INSERT INTO domains (account_id, name, third_id, record_count) VALUES (?, ?, ?, ?)').run(
          account_id, domainName, providerThirdId, d.RecordCount ?? 0
        );
        added++;
      } else {
        db.prepare('UPDATE domains SET name = ?, third_id = ?, record_count = ? WHERE id = ?').run(
          domainName, providerThirdId, d.RecordCount ?? 0, existing.id
        );
      }
    }
    res.json({ code: 0, data: { total: result.total, added }, msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * @swagger
 * /api/domains/provider-list/{accountId}:
 *   get:
 *     summary: List domains available from a DNS provider account
 *     tags: [Domains]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of domains from provider
 */
router.get('/provider-list/:accountId', authMiddleware, async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId);
  const account = getAccountForUser(accountId, req.user!.userId, req.user!.role);
  if (!account) {
    res.json({ code: -1, msg: 'Account not found or access denied' });
    return;
  }
  try {
    const cfg = JSON.parse(account.config) as Record<string, string>;
    const adapter = createAdapter(account.type, cfg);
    const result = await adapter.getDomainList();
    const domains = result.list.map((d) => ({ name: d.Domain, third_id: d.ThirdId }));
    res.json({ code: 0, data: domains, msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * @swagger
 * /api/domains/{id}:
 *   get:
 *     summary: Get domain info
 *     tags: [Domains]
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
 *         description: Domain info
 */
router.get('/:id', authMiddleware, (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const domain = canAccessDomain(id, req.user!.userId, req.user!.role);
  if (!domain) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  res.json({ code: 0, data: domain, msg: 'success' });
});

/**
 * @swagger
 * /api/domains/{id}:
 *   put:
 *     summary: Update domain
 *     tags: [Domains]
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
 *               remark:
 *                 type: string
 *               is_hidden:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Domain updated
 */
router.put('/:id', authMiddleware, (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const domain = canAccessDomain(id, req.user!.userId, req.user!.role);
  if (!domain) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  const { remark, is_hidden } = req.body as { remark?: string; is_hidden?: number };
  const updates: string[] = [];
  const params: unknown[] = [];
  if (remark !== undefined) { updates.push('remark = ?'); params.push(remark); }
  if (is_hidden !== undefined) { updates.push('is_hidden = ?'); params.push(is_hidden); }
  if (updates.length === 0) {
    res.json({ code: 0, msg: 'success' });
    return;
  }
  params.push(id);
  getDb().prepare(`UPDATE domains SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ code: 0, msg: 'success' });
});

/**
 * @swagger
 * /api/domains/{id}:
 *   delete:
 *     summary: Delete domain
 *     tags: [Domains]
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
 *         description: Domain deleted
 */
router.delete('/:id', authMiddleware, (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const domain = canAccessDomain(id, req.user!.userId, req.user!.role);
  if (!domain) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  getDb().prepare('DELETE FROM domains WHERE id = ?').run(id);
  res.json({ code: 0, msg: 'success' });
});

/**
 * @swagger
 * /api/domains/{id}/lines:
 *   get:
 *     summary: Get record lines for domain
 *     tags: [Domains]
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
 *         description: Record lines
 */
router.get('/:id/lines', authMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const domain = canAccessDomain(id, req.user!.userId, req.user!.role);
  if (!domain) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  const db = getDb();
  const account = db.prepare('SELECT * FROM dns_accounts WHERE id = ?').get(domain.account_id) as DnsAccount | undefined;
  if (!account) {
    res.json({ code: -1, msg: 'Account not found' });
    return;
  }
  try {
    const cfg = JSON.parse(account.config) as Record<string, string>;
    const adapter = createAdapter(account.type, cfg, domain.name, domain.third_id);
    const lines = await adapter.getRecordLines();
    res.json({ code: 0, data: lines, msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

export { canAccessDomain, getAccountForUser };
export default router;
