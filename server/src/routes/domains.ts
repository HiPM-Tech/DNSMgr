import { Router, Request, Response } from 'express';
import { query, get, execute, insert, run, now } from '../db';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { createAdapter } from '../lib/dns/DnsHelper';
import { createFailoverConfig, getFailoverConfigByDomain, getFailoverStatus, updateFailoverConfig, deleteFailoverConfig } from '../service/failover';
import { DnsAccount, Domain } from '../types';
import { ROLE_ADMIN, isSuper, normalizeRole } from '../utils/roles';
import { logAuditOperation } from '../service/audit';
import { parseInteger, sendError, sendSuccess, sendServerError } from '../utils/http';
import { log } from '../lib/logger';

const router = Router();

// 本地 db 对象，兼容旧代码
const db = { get, query, execute, insert, run, now };

function normalizeDomainName(name: string): string {
  return name.trim().toLowerCase();
}

async function getAccountForUser(accountId: number, userId: number, role: number): Promise<DnsAccount | null> {
  const account = await db.get<DnsAccount>('SELECT * FROM dns_accounts WHERE id = ?', [accountId]);
  if (!account) return null;
  if (isSuper(role) || account.created_by === userId) return account;
  if (account.team_id) {
    const membership = await db.get<{ id: number }>('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?', [account.team_id, userId]);
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
  const userPerms = await db.query<{ permission: 'read' | 'write'; sub: string }>(
    'SELECT permission, sub FROM domain_permissions WHERE domain_id = ? AND user_id = ?',
    [domainId, userId]
  );
  const teamPerms = await db.query<{ permission: 'read' | 'write'; sub: string }>(
    `SELECT dp.permission, dp.sub
     FROM domain_permissions dp
     INNER JOIN team_members tm ON tm.team_id = dp.team_id
     WHERE dp.domain_id = ? AND tm.user_id = ?`,
    [domainId, userId]
  );
  return [...userPerms, ...teamPerms].map((row) => ({
    permission: row.permission,
    sub: normalizeSubInput(row.sub),
  }));
}

async function getUserPermissionRows(domainId: number, userId: number): Promise<Array<{ permission: 'read' | 'write'; sub: string }>> {
  const userPerms = await db.query<{ permission: 'read' | 'write'; sub: string }>(
    'SELECT permission, sub FROM domain_permissions WHERE domain_id = ? AND user_id = ?',
    [domainId, userId]
  );
  return userPerms.map((row) => ({
    permission: row.permission,
    sub: normalizeSubInput(row.sub),
  }));
}

async function resolveDomainAccess(domain: Domain, userId: number, role: number): Promise<DomainAccess> {
  const hasRules = !!(await db.get('SELECT 1 FROM domain_permissions WHERE domain_id = ? LIMIT 1', [domain.id]));
  if (isSuper(role)) {
    return { domain, canRead: true, canWrite: true, writeSubs: null, hasRules };
  }
  const owner = await db.get<{ created_by: number }>('SELECT created_by FROM dns_accounts WHERE id = ?', [domain.account_id]);
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
  const domain = await db.get<Domain>('SELECT * FROM domains WHERE id = ?', [domainId]);
  if (!domain) return null;
  const access = await resolveDomainAccess(domain, userId, role);
  return access.canRead ? domain : null;
}

export async function getDomainAccess(domainId: number, userId: number, role: number): Promise<DomainAccess> {
  const domain = await db.get<Domain>('SELECT * FROM domains WHERE id = ?', [domainId]);
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
router.get('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { account_id, keyword } = req.query as { account_id?: string; keyword?: string };
  const userId = req.user!.userId;
  const role = normalizeRole(req.user!.role);

  let query = 'SELECT d.* FROM domains d';
  const params: unknown[] = [];

  if (!isSuper(role)) {
    const teamMembers = await db.query<{ team_id: number }>('SELECT team_id FROM team_members WHERE user_id = ?', [userId]);
    const teamIds = teamMembers.map(r => r.team_id);
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

  if (account_id) { query += ' AND d.account_id = ?'; params.push(parseInteger(account_id)); }
  if (keyword) { query += ' AND d.name LIKE ?'; params.push(`%${keyword}%`); }
  query += ' ORDER BY d.id';

  let domains = await db.query<Domain>(query, params);
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
          account = await db.get<DnsAccount>('SELECT * FROM dns_accounts WHERE id = ?', [domain.account_id]);
          if (!account) return;
          accountCache.set(domain.account_id, account);
        }

        try {
          // MySQL JSON type returns object directly, SQLite/PostgreSQL returns string
          const cfg = typeof account.config === 'string' ? JSON.parse(account.config) as Record<string, string> : account.config as Record<string, string>;
          const dnsAdapter = createAdapter(account.type, cfg, domain.name, domain.third_id);
          const result = await dnsAdapter.getDomainRecords(1, 1);
          domain.record_count = result.total;
          await db.execute('UPDATE domains SET record_count = ? WHERE id = ?', [result.total, domain.id]);
        } catch {
          // Keep the cached count if the provider is temporarily unavailable.
        }
      })
  );

  sendSuccess(res, domains);
}));

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
router.post('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
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
    sendError(res, 'account_id and domain name are required');
    return;
  }
  const account = await getAccountForManage(account_id, req.user!.userId, normalizeRole(req.user!.role));
  if (!account) {
    sendError(res, 'Account not found or access denied');
    return;
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
    sendError(res, 'No valid domain names provided');
    return;
  }

  let added = 0;
  let firstId: number | null = null;
  const addedDomains: string[] = [];
  const duplicates: string[] = [];

  for (const item of normalizedMap.values()) {
    const existing = await db.get('SELECT id FROM domains WHERE account_id = ? AND name = ?', [account_id, item.name]);
    if (existing) {
      await db.execute('UPDATE domains SET third_id = ?, record_count = ? WHERE id = ?', [item.third_id || '', item.record_count ?? 0, (existing as { id: number }).id]);
      duplicates.push(item.name);
      continue;
    }
    try {
      const id = await db.insert(
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
    sendError(res, duplicates.length > 0 ? `Domain already exists: ${duplicates.join(', ')}` : 'No domain added');
    return;
  }

  const duplicateMsg = duplicates.length > 0 ? `, skipped ${duplicates.length} duplicate(s)` : '';
  for (const domainName of addedDomains) {
    await logAuditOperation(req.user!.userId, 'add_domain', domainName, { accountId: account_id });
  }
  sendSuccess(res, { id: firstId, added, skipped: duplicates.length, duplicates },
    added > 1 ? `Added ${added} domains${duplicateMsg}` : `Domain added successfully${duplicateMsg}`);
}));

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
router.post('/sync', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { account_id } = req.body as { account_id: number };
  if (!account_id) {
    sendError(res, 'account_id is required');
    return;
  }
  const account = await getAccountForManage(account_id, req.user!.userId, normalizeRole(req.user!.role));
  if (!account) {
    sendError(res, 'Account not found or access denied');
    return;
  }
  try {
    // MySQL JSON type returns object directly, SQLite/PostgreSQL returns string
    const cfg = typeof account.config === 'string' ? JSON.parse(account.config) as Record<string, string> : account.config as Record<string, string>;
    const dnsAdapter = createAdapter(account.type, cfg);
    const result = await dnsAdapter.getDomainList();
    let added = 0;
    for (const d of result.list) {
      const normalizedName = normalizeDomainName(d.Domain);
      const existing = await db.get('SELECT id FROM domains WHERE account_id = ? AND name = ?', [account_id, normalizedName]);
      if (!existing) {
        await db.execute(
          'INSERT INTO domains (account_id, name, third_id, record_count) VALUES (?, ?, ?, ?)',
          [account_id, normalizedName, d.ThirdId, d.RecordCount ?? 0]
        );
        added++;
        await logAuditOperation(req.user!.userId, 'sync_add_domain', normalizedName, { accountId: account_id });
      } else {
        await db.execute(
          'UPDATE domains SET third_id = ?, record_count = ? WHERE account_id = ? AND name = ?',
          [d.ThirdId, d.RecordCount ?? 0, account_id, normalizedName]
        );
      }
    }
    await logAuditOperation(req.user!.userId, 'sync_domains', '', { accountId: account_id, total: result.total, added });
    sendSuccess(res, { total: result.total, added });
  } catch (e) {
    sendError(res, e instanceof Error ? e.message : String(e));
  }
}));

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
router.get('/provider-list/:accountId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const accountId = parseInteger(req.params.accountId) ?? 0;
  const account = await getAccountForManage(accountId, req.user!.userId, normalizeRole(req.user!.role));
  if (!account) {
    sendError(res, 'Account not found or access denied');
    return;
  }
  try {
    // MySQL JSON type returns object directly, SQLite/PostgreSQL returns string
    const cfg = typeof account.config === 'string' ? JSON.parse(account.config) as Record<string, string> : account.config as Record<string, string>;
    log.info('ProviderList', 'Fetching domains', { accountType: account.type, configKeys: Object.keys(cfg) });
    const dnsAdapter = createAdapter(account.type, cfg);
    const result = await dnsAdapter.getDomainList();
    log.info('ProviderList', 'Domains fetched', { total: result.total, listCount: result.list.length });
    const domains = result.list.map((d) => ({
      name: normalizeDomainName(d.Domain),
      third_id: d.ThirdId,
      record_count: d.RecordCount ?? 0,
    }));
    sendSuccess(res, domains);
  } catch (e) {
    log.error('ProviderList', 'Error fetching domains', e);
    sendError(res, e instanceof Error ? e.message : String(e));
  }
}));

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
router.get('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = parseInteger(req.params.id) ?? 0;
  const access = await getDomainAccess(id, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    sendError(res, 'Domain not found');
    return;
  }
  sendSuccess(res, access.domain);
}));

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
router.put('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = parseInteger(req.params.id) ?? 0;
  const access = await getDomainAccess(id, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    sendError(res, 'Domain not found');
    return;
  }
  if (!access.canWrite) {
    sendError(res, 'Permission denied');
    return;
  }
  const { remark, is_hidden } = req.body as { remark?: string; is_hidden?: number };
  const updates: string[] = [];
  const params: unknown[] = [];
  if (remark !== undefined) { updates.push('remark = ?'); params.push(remark); }
  if (is_hidden !== undefined) { updates.push('is_hidden = ?'); params.push(is_hidden); }
  if (updates.length === 0) {
    sendSuccess(res);
    return;
  }
  params.push(id);
  await db.execute(`UPDATE domains SET ${updates.join(', ')} WHERE id = ?`, params);
  await logAuditOperation(req.user!.userId, 'update_domain', access.domain.name, { remark, is_hidden });
  sendSuccess(res);
}));

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
router.delete('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = parseInteger(req.params.id) ?? 0;
  const access = await getDomainAccess(id, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    sendError(res, 'Domain not found');
    return;
  }
  if (!access.canWrite) {
    sendError(res, 'Permission denied');
    return;
  }
  await db.execute('DELETE FROM domains WHERE id = ?', [id]);
  await logAuditOperation(req.user!.userId, 'delete_domain', access.domain.name, { domainId: id, accountId: access.domain.account_id });
  sendSuccess(res);
}));

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
router.get('/:id/lines', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = parseInteger(req.params.id) ?? 0;
  const access = await getDomainAccess(id, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    sendError(res, 'Domain not found');
    return;
  }
  const account = await db.get<DnsAccount>('SELECT * FROM dns_accounts WHERE id = ?', [access.domain.account_id]);
  if (!account) {
    sendError(res, 'Account not found');
    return;
  }
  try {
    const cfg = JSON.parse(account.config) as Record<string, string>;
    const dnsAdapter = createAdapter(account.type, cfg, access.domain.name, access.domain.third_id);
    const lines = await dnsAdapter.getRecordLines();
    sendSuccess(res, lines);
  } catch (e) {
    sendError(res, e instanceof Error ? e.message : String(e));
  }
}));

router.get('/:id/failover', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const domainId = parseInteger(req.params.id, { min: 1 }) ?? 0;
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    sendError(res, 'No permission', 403);
    return;
  }
  const config = await getFailoverConfigByDomain(domainId);
  if (!config) {
    sendSuccess(res, null);
    return;
  }
  const status = await getFailoverStatus(config.id);
  sendSuccess(res, { config, status });
}));

router.post('/:id/failover', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const domainId = parseInteger(req.params.id, { min: 1 }) ?? 0;
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canWrite) {
    sendError(res, 'No write permission', 403);
    return;
  }
  const { primaryIp, backupIps, checkMethod, checkInterval, checkPort, checkPath, autoSwitchBack } = req.body;
  if (!primaryIp) {
    sendError(res, 'primaryIp is required', 400);
    return;
  }
  const existing = await getFailoverConfigByDomain(domainId);
  const configData = {
    primaryIp,
    backupIps: backupIps || [],
    checkMethod: checkMethod || 'ping',
    checkInterval: checkInterval || 60,
    checkPort: checkPort || 80,
    checkPath: checkPath || '',
    autoSwitchBack: autoSwitchBack !== false,
    enabled: true,
  };
  if (existing) {
    await updateFailoverConfig(existing.id, configData);
    sendSuccess(res, { id: existing.id });
  } else {
    const configId = await createFailoverConfig(domainId, configData);
    sendSuccess(res, { id: configId });
  }
}));

router.put('/:id/failover', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const domainId = parseInteger(req.params.id, { min: 1 }) ?? 0;
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canWrite) {
    sendError(res, 'No write permission', 403);
    return;
  }
  const existing = await getFailoverConfigByDomain(domainId);
  if (!existing) {
    sendError(res, 'Not found', 404);
    return;
  }
  await updateFailoverConfig(existing.id, req.body);
  sendSuccess(res);
}));

router.delete('/:id/failover', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const domainId = parseInteger(req.params.id, { min: 1 }) ?? 0;
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canWrite) {
    sendError(res, 'No write permission', 403);
    return;
  }
  const existing = await getFailoverConfigByDomain(domainId);
  if (!existing) {
    sendError(res, 'Not found', 404);
    return;
  }
  await deleteFailoverConfig(existing.id);
  sendSuccess(res);
}));

export { canAccessDomain, getAccountForUser };
export default router;
