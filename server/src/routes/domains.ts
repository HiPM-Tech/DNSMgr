import { Router, Request, Response } from 'express';
import { getAdapter } from '../db/adapter';
import { authMiddleware } from '../middleware/auth';
import { createAdapter } from '../lib/dns/DnsHelper';
import { createFailoverConfig, getFailoverConfigByDomain, getFailoverStatus, updateFailoverConfig, deleteFailoverConfig } from '../service/failover';
import { DnsAccount, Domain } from '../types';
import { ROLE_ADMIN, isSuper, normalizeRole } from '../utils/roles';

const router = Router();

function normalizeDomainName(name: string): string {
  return name.trim().toLowerCase();
}

async function logOperation(userId: number, action: string, domainName: string, data: unknown): Promise<void> {
  const adapter = getAdapter();
  if (!adapter) return;
  await adapter.execute(
    'INSERT INTO operation_logs (user_id, action, domain, data) VALUES (?, ?, ?, ?)',
    [userId, action, domainName, JSON.stringify(data)]
  );
}

async function getAccountForUser(accountId: number, userId: number, role: number): Promise<DnsAccount | null> {
  const adapter = getAdapter();
  if (!adapter) return null;
  const account = await adapter.get('SELECT * FROM dns_accounts WHERE id = ?', [accountId]) as DnsAccount | undefined;
  if (!account) return null;
  if (isSuper(role) || account.created_by === userId) return account;
  if (account.team_id) {
    const membership = await adapter.get('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?', [account.team_id, userId]);
    if (membership) return account;
  }
  return null;
}

async function getAccountForManage(accountId: number, userId: number, role: number): Promise<DnsAccount | null> {
  const account = await getAccountForUser(accountId, userId, role);
  if (!account) return null;
  if (isSuper(role)) return account;
  if (role >= ROLE_ADMIN && account.created_by === userId) return account;
  return null;
}

type DomainAccess = {
  domain: Domain | null;
  canRead: boolean;
  canWrite: boolean;
  writeSubs: string[] | null;
  hasRules: boolean;
};

function normalizeSubInput(sub?: string): string {
  const trimmed = (sub ?? '').trim().toLowerCase();
  if (trimmed === '@') return '@';
  return trimmed;
}

async function getPermissionRows(domainId: number, userId: number): Promise<Array<{ permission: 'read' | 'write'; sub: string }>> {
  const adapter = getAdapter();
  if (!adapter) return [];
  const userPerms = await adapter.query(
    'SELECT permission, sub FROM domain_permissions WHERE domain_id = ? AND user_id = ?',
    [domainId, userId]
  ) as Array<{ permission: 'read' | 'write'; sub: string }>;
  const teamPerms = await adapter.query(
    `SELECT dp.permission, dp.sub
     FROM domain_permissions dp
     INNER JOIN team_members tm ON tm.team_id = dp.team_id
     WHERE dp.domain_id = ? AND tm.user_id = ?`,
    [domainId, userId]
  ) as Array<{ permission: 'read' | 'write'; sub: string }>;
  return [...userPerms, ...teamPerms].map((row) => ({
    permission: row.permission,
    sub: normalizeSubInput(row.sub),
  }));
}

async function getUserPermissionRows(domainId: number, userId: number): Promise<Array<{ permission: 'read' | 'write'; sub: string }>> {
  const adapter = getAdapter();
  if (!adapter) return [];
  const userPerms = await adapter.query(
    'SELECT permission, sub FROM domain_permissions WHERE domain_id = ? AND user_id = ?',
    [domainId, userId]
  ) as Array<{ permission: 'read' | 'write'; sub: string }>;
  return userPerms.map((row) => ({
    permission: row.permission,
    sub: normalizeSubInput(row.sub),
  }));
}

async function resolveDomainAccess(domain: Domain, userId: number, role: number): Promise<DomainAccess> {
  const adapter = getAdapter();
  if (!adapter) return { domain, canRead: false, canWrite: false, writeSubs: [], hasRules: false };
  const hasRules = !!(await adapter.get('SELECT 1 FROM domain_permissions WHERE domain_id = ? LIMIT 1', [domain.id]));
  if (isSuper(role)) {
    return { domain, canRead: true, canWrite: true, writeSubs: null, hasRules };
  }
  const owner = await adapter.get('SELECT created_by FROM dns_accounts WHERE id = ?', [domain.account_id]) as { created_by: number } | undefined;
  if (owner?.created_by === userId && role >= ROLE_ADMIN) {
    return { domain, canRead: true, canWrite: true, writeSubs: null, hasRules };
  }
  if (hasRules) {
    const userPerms = await getUserPermissionRows(domain.id, userId);
    const perms = userPerms.length > 0 ? userPerms : await getPermissionRows(domain.id, userId);
    if (perms.length === 0) {
      return { domain, canRead: false, canWrite: false, writeSubs: [], hasRules };
    }
    const canWrite = perms.some((p) => p.permission === 'write');
    const canRead = perms.some((p) => p.permission === 'read' || p.permission === 'write');
    let writeSubs: string[] | null = [];
    if (canWrite) {
      const writePerms = perms.filter((p) => p.permission === 'write');
      const hasAll = writePerms.some((p) => !p.sub);
      writeSubs = hasAll ? null : Array.from(new Set(writePerms.map((p) => p.sub)));
    }
    return { domain, canRead, canWrite, writeSubs, hasRules };
  }
  return { domain, canRead: false, canWrite: false, writeSubs: [], hasRules };
}

async function canAccessDomain(domainId: number, userId: number, role: number): Promise<Domain | null> {
  const adapter = getAdapter();
  if (!adapter) return null;
  const domain = await adapter.get('SELECT * FROM domains WHERE id = ?', [domainId]) as Domain | undefined;
  if (!domain) return null;
  const access = await resolveDomainAccess(domain, userId, role);
  return access.canRead ? domain : null;
}

export async function getDomainAccess(domainId: number, userId: number, role: number): Promise<DomainAccess> {
  const adapter = getAdapter();
  if (!adapter) return { domain: null, canRead: false, canWrite: false, writeSubs: [], hasRules: false };
  const domain = await adapter.get('SELECT * FROM domains WHERE id = ?', [domainId]) as Domain | undefined;
  if (!domain) {
    return { domain: null, canRead: false, canWrite: false, writeSubs: [], hasRules: false };
  }
  return await resolveDomainAccess(domain, userId, role);
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
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const adapter = getAdapter();
  if (!adapter) {
    return res.status(500).json({ code: 500, msg: 'Database error' });
  }
  const { account_id, keyword } = req.query as { account_id?: string; keyword?: string };
  const userId = req.user!.userId;
  const role = normalizeRole(req.user!.role);

  let query = 'SELECT d.* FROM domains d';
  const params: unknown[] = [];

  if (!isSuper(role)) {
    const teamIds = ((await adapter.query('SELECT team_id FROM team_members WHERE user_id = ?', [userId])) as unknown as { team_id: number }[]).map(r => r.team_id);
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

  let domains = (await adapter.query(query, params)) as unknown as Domain[];
  if (!isSuper(role)) {
    domains = await Promise.all(domains.map(async (domain) => {
      const access = await resolveDomainAccess(domain, userId, role);
      return access.canRead ? domain : null;
    })).then(results => results.filter((d): d is Domain => d !== null));
  }

  const accountCache = new Map<number, DnsAccount>();
  await Promise.allSettled(
    domains
      .filter((domain) => !domain.record_count)
      .map(async (domain) => {
        let account = accountCache.get(domain.account_id);
        if (!account) {
          account = await adapter.get('SELECT * FROM dns_accounts WHERE id = ?', [domain.account_id]) as DnsAccount | undefined;
          if (!account) return;
          accountCache.set(domain.account_id, account);
        }

        try {
          const cfg = JSON.parse(account.config) as Record<string, string>;
          const dnsAdapter = createAdapter(account.type, cfg, domain.name, domain.third_id);
          const result = await dnsAdapter.getDomainRecords(1, 1);
          domain.record_count = result.total;
          await adapter.execute('UPDATE domains SET record_count = ? WHERE id = ?', [result.total, domain.id]);
        } catch {
          // Keep the cached count if the provider is temporarily unavailable.
        }
      })
  );

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
  const {
    account_id,
    name,
    third_id = '',
    remark = '',
    domains,
  } = req.body as {
    account_id: number;
    name?: string;
    third_id?: string;
    remark?: string;
    domains?: Array<{ name: string; third_id?: string; record_count?: number }>;
  };
  if (!account_id || (!name && (!domains || domains.length === 0))) {
    res.json({ code: -1, msg: 'account_id and domain name are required' });
    return;
  }
  const account = await getAccountForManage(account_id, req.user!.userId, normalizeRole(req.user!.role));
  if (!account) {
    res.json({ code: -1, msg: 'Account not found or access denied' });
    return;
  }
  const adapter = getAdapter();
  if (!adapter) {
    return res.status(500).json({ code: 500, msg: 'Database error' });
  }
  const items = (domains && domains.length > 0)
    ? domains
    : [{ name: name!, third_id, record_count: 0 }];

  const normalizedMap = new Map<string, { name: string; third_id?: string; record_count?: number }>();
  for (const item of items) {
    const normalizedName = normalizeDomainName(item.name);
    if (!normalizedName) continue;
    normalizedMap.set(normalizedName, {
      name: normalizedName,
      third_id: item.third_id?.trim() || '',
      record_count: item.record_count ?? 0,
    });
  }

  if (normalizedMap.size === 0) {
    res.json({ code: -1, msg: 'No valid domain names provided' });
    return;
  }

  let added = 0;
  let firstId: number | null = null;
  const addedDomains: string[] = [];
  const duplicates: string[] = [];

  for (const item of normalizedMap.values()) {
    const existing = await adapter.get('SELECT id FROM domains WHERE account_id = ? AND name = ?', [account_id, item.name]);
    if (existing) {
      await adapter.execute('UPDATE domains SET third_id = ?, record_count = ? WHERE id = ?', [item.third_id || '', item.record_count ?? 0, (existing as { id: number }).id]);
      duplicates.push(item.name);
      continue;
    }
    try {
      const id = await adapter.insert(
        'INSERT INTO domains (account_id, name, third_id, remark, record_count) VALUES (?, ?, ?, ?, ?)',
        [account_id, item.name, item.third_id || '', remark, item.record_count ?? 0]
      );
      if (firstId === null) firstId = id;
      added++;
      addedDomains.push(item.name);
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('unique')) {
        duplicates.push(item.name);
      } else {
        throw error;
      }
    }
  }

  if (added === 0) {
    res.json({
      code: -1,
      msg: duplicates.length > 0 ? `Domain already exists: ${duplicates.join(', ')}` : 'No domain added',
    });
    return;
  }

  const duplicateMsg = duplicates.length > 0 ? `, skipped ${duplicates.length} duplicate(s)` : '';
  for (const domainName of addedDomains) {
    await logOperation(req.user!.userId, 'add_domain', domainName, { accountId: account_id });
  }
  res.json({
    code: 0,
    data: { id: firstId, added, skipped: duplicates.length, duplicates },
    msg: added > 1 ? `Added ${added} domains${duplicateMsg}` : `Domain added successfully${duplicateMsg}`,
  });
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
  const account = await getAccountForManage(account_id, req.user!.userId, normalizeRole(req.user!.role));
  if (!account) {
    res.json({ code: -1, msg: 'Account not found or access denied' });
    return;
  }
  const adapter = getAdapter();
  if (!adapter) {
    return res.status(500).json({ code: 500, msg: 'Database error' });
  }
  try {
    const cfg = JSON.parse(account.config) as Record<string, string>;
    const dnsAdapter = createAdapter(account.type, cfg);
    const result = await dnsAdapter.getDomainList();
    let added = 0;
    for (const d of result.list) {
      const normalizedName = normalizeDomainName(d.Domain);
      const existing = await adapter.get('SELECT id FROM domains WHERE account_id = ? AND name = ?', [account_id, normalizedName]);
      if (!existing) {
        await adapter.execute(
          'INSERT INTO domains (account_id, name, third_id, record_count) VALUES (?, ?, ?, ?)',
          [account_id, normalizedName, d.ThirdId, d.RecordCount ?? 0]
        );
        added++;
        await logOperation(req.user!.userId, 'sync_add_domain', normalizedName, { accountId: account_id });
      } else {
        await adapter.execute(
          'UPDATE domains SET third_id = ?, record_count = ? WHERE account_id = ? AND name = ?',
          [d.ThirdId, d.RecordCount ?? 0, account_id, normalizedName]
        );
      }
    }
    await logOperation(req.user!.userId, 'sync_domains', '', { accountId: account_id, total: result.total, added });
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
  const account = await getAccountForManage(accountId, req.user!.userId, normalizeRole(req.user!.role));
  if (!account) {
    res.json({ code: -1, msg: 'Account not found or access denied' });
    return;
  }
  try {
    const cfg = JSON.parse(account.config) as Record<string, string>;
    const dnsAdapter = createAdapter(account.type, cfg);
    const result = await dnsAdapter.getDomainList();
    const domains = result.list.map((d) => ({
      name: normalizeDomainName(d.Domain),
      third_id: d.ThirdId,
      record_count: d.RecordCount ?? 0,
    }));
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
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const access = await getDomainAccess(id, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  res.json({ code: 0, data: access.domain, msg: 'success' });
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
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const access = await getDomainAccess(id, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  if (!access.canWrite) {
    res.json({ code: -1, msg: 'Permission denied' });
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
  const adapter = getAdapter();
  if (!adapter) {
    return res.status(500).json({ code: 500, msg: 'Database error' });
  }
  await adapter.execute(`UPDATE domains SET ${updates.join(', ')} WHERE id = ?`, params);
  await logOperation(req.user!.userId, 'update_domain', access.domain.name, { remark, is_hidden });
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
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const access = await getDomainAccess(id, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  if (!access.canWrite) {
    res.json({ code: -1, msg: 'Permission denied' });
    return;
  }
  const adapter = getAdapter();
  if (!adapter) {
    return res.status(500).json({ code: 500, msg: 'Database error' });
  }
  await adapter.execute('DELETE FROM domains WHERE id = ?', [id]);
  await logOperation(req.user!.userId, 'delete_domain', access.domain.name, { domainId: id, accountId: access.domain.account_id });
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
  const access = await getDomainAccess(id, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  const adapter = getAdapter();
  if (!adapter) {
    return res.status(500).json({ code: 500, msg: 'Database error' });
  }
  const account = await adapter.get('SELECT * FROM dns_accounts WHERE id = ?', [access.domain.account_id]) as DnsAccount | undefined;
  if (!account) {
    res.json({ code: -1, msg: 'Account not found' });
    return;
  }
  try {
    const cfg = JSON.parse(account.config) as Record<string, string>;
    const dnsAdapter = createAdapter(account.type, cfg, access.domain.name, access.domain.third_id);
    const lines = await dnsAdapter.getRecordLines();
    res.json({ code: 0, data: lines, msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/:id/failover', authMiddleware, async (req: Request, res: Response) => {
  const domainId = parseInt(req.params.id, 10);
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    res.status(403).json({ code: 403, msg: 'No permission' });
    return;
  }
  try {
    const config = await getFailoverConfigByDomain(domainId);
    if (!config) {
      res.json({ code: 0, data: null, msg: 'success' });
      return;
    }
    const status = await getFailoverStatus(config.id);
    res.json({ code: 0, data: { config, status }, msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/:id/failover', authMiddleware, async (req: Request, res: Response) => {
  const domainId = parseInt(req.params.id, 10);
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canWrite) {
    res.status(403).json({ code: 403, msg: 'No write permission' });
    return;
  }
  const { primaryIp, backupIps, checkMethod, checkInterval, checkPort, checkPath, autoSwitchBack } = req.body;
  if (!primaryIp) {
    res.status(400).json({ code: -1, msg: 'primaryIp is required' });
    return;
  }
  try {
    const existing = await getFailoverConfigByDomain(domainId);
    if (existing) {
      await updateFailoverConfig(existing.id, { primaryIp, backupIps, checkMethod, checkInterval, checkPort, checkPath, autoSwitchBack });
      res.json({ code: 0, data: { id: existing.id }, msg: 'success' });
    } else {
      const config = await createFailoverConfig(domainId, primaryIp, backupIps || [], checkMethod, checkInterval, checkPort, checkPath, autoSwitchBack);
      res.json({ code: 0, data: config, msg: 'success' });
    }
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

router.put('/:id/failover', authMiddleware, async (req: Request, res: Response) => {
  const domainId = parseInt(req.params.id, 10);
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canWrite) {
    res.status(403).json({ code: 403, msg: 'No write permission' });
    return;
  }
  try {
    const existing = await getFailoverConfigByDomain(domainId);
    if (!existing) {
      res.status(404).json({ code: -1, msg: 'Not found' });
      return;
    }
    await updateFailoverConfig(existing.id, req.body);
    res.json({ code: 0, msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

router.delete('/:id/failover', authMiddleware, async (req: Request, res: Response) => {
  const domainId = parseInt(req.params.id, 10);
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canWrite) {
    res.status(403).json({ code: 403, msg: 'No write permission' });
    return;
  }
  try {
    const existing = await getFailoverConfigByDomain(domainId);
    if (!existing) {
      res.status(404).json({ code: -1, msg: 'Not found' });
      return;
    }
    await deleteFailoverConfig(existing.id);
    res.json({ code: 0, msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

export { canAccessDomain, getAccountForUser };
export default router;
