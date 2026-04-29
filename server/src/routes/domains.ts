import { Router, Request, Response } from 'express';
import { authMiddleware, requireDomainPermission, requireTokenDomainPermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { createAdapter } from '../lib/dns/DnsHelper';
import { dnsheRenewSubdomain, dnsheGetWhois } from '../lib/dns/providers';
import { renewalRegistry } from '../service/renewalScheduler';
import { createFailoverConfig, getFailoverConfigByDomain, getFailoverStatus, updateFailoverConfig, deleteFailoverConfig } from '../service/failover';
import { DnsAccount, Domain } from '../types';
import { ROLE_ADMIN, isSuper, normalizeRole } from '../utils/roles';
import { logAuditOperation } from '../service/audit';
import { parseInteger, sendError, sendSuccess, sendServerError } from '../utils/http';
import { log } from '../lib/logger';
import { DomainOperations, DnsAccountOperations, DomainPermissionOperations, TeamOperations, RenewableDomainOperations } from '../db/business-adapter';
import { syncDomainWhois } from '../service/whoisJob';
import { getRootDomain } from '../service/whoisProvider';

const router = Router();

function normalizeDomainName(name: string): string {
  return name.trim().toLowerCase();
}

async function getAccountForUser(accountId: number, userId: number, role: number): Promise<DnsAccount | null> {
  const account = await DnsAccountOperations.getById(accountId) as DnsAccount | undefined;
  if (!account) return null;
  if (isSuper(role) || account.created_by === userId) return account;
  if (account.team_id) {
    const isMember = await TeamOperations.isMember(account.team_id, userId);
    if (isMember) return account;
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
  const userPerms = await DomainPermissionOperations.getByDomainAndUser(domainId, userId) as Array<{ permission: 'read' | 'write'; sub: string }>;
  const teamPerms = await DomainPermissionOperations.getByDomainAndTeamMember(domainId, userId) as Array<{ permission: 'read' | 'write'; sub: string }>;
  return [...userPerms, ...teamPerms].map((row) => ({
    permission: row.permission,
    sub: normalizeSubInput(row.sub),
  }));
}

async function getUserPermissionRows(domainId: number, userId: number): Promise<Array<{ permission: 'read' | 'write'; sub: string }>> {
  const userPerms = await DomainPermissionOperations.getByDomainAndUser(domainId, userId) as Array<{ permission: 'read' | 'write'; sub: string }>;
  return userPerms.map((row) => ({
    permission: row.permission,
    sub: normalizeSubInput(row.sub),
  }));
}

async function resolveDomainAccess(domain: Domain, userId: number, role: number): Promise<DomainAccess> {
  const hasRules = await DomainPermissionOperations.hasRules(domain.id);
  if (isSuper(role)) {
    return { domain, canRead: true, canWrite: true, writeSubs: null, hasRules };
  }
  const createdBy = await DnsAccountOperations.getCreatedBy(domain.account_id);
  if (createdBy === userId && role >= ROLE_ADMIN) {
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

async function resolveDomainAccessById(domainId: number, userId: number, role: number): Promise<DomainAccess> {
  const domain = await DomainOperations.getById(domainId) as Domain | undefined;
  if (!domain) {
    return { domain: null, canRead: false, canWrite: false, writeSubs: [], hasRules: false };
  }
  return resolveDomainAccess(domain, userId, role);
}

async function canAccessDomain(domainId: number, userId: number, role: number): Promise<Domain | null> {
  const domain = await DomainOperations.getById(domainId) as Domain | undefined;
  if (!domain) return null;
  const access = await resolveDomainAccess(domain, userId, role);
  return access.canRead ? domain : null;
}

export async function getDomainAccess(domainId: number, userId: number, role: number): Promise<DomainAccess> {
  const domain = await DomainOperations.getById(domainId) as Domain | undefined;
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
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of domains
 */
router.get('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { account_id, keyword, domain_type, page, pageSize, format } = req.query as { 
    account_id?: string; 
    keyword?: string; 
    domain_type?: string; 
    page?: string; 
    pageSize?: string;
    format?: string; // 'array' for direct array response (for external adapters)
  };
  const userId = req.user!.userId;
  const role = normalizeRole(req.user!.role);

  // Pagination params
  const currentPage = Math.max(1, parseInteger(page) || 1);
  const size = Math.min(100, Math.max(1, parseInteger(pageSize) || 20));

  // Check if using token auth and get allowed domains
  const tokenPayload = (req as any).tokenPayload;
  const tokenAllowedDomains = tokenPayload?.allowedDomains as number[] | undefined;

  const teamIds = isSuper(role) ? [] : await TeamOperations.getTeamIdsByUserId(userId);

  let domains = await DomainOperations.getAccessibleDomains({
    userId,
    teamIds,
    accountId: account_id ? parseInteger(account_id) : undefined,
    keyword,
    isSuper: isSuper(role),
  }) as unknown as Domain[];

  // Filter by token allowed domains if using token auth
  // Empty allowed_domains array means all domains are allowed
  if (tokenAllowedDomains && tokenAllowedDomains.length > 0) {
    domains = domains.filter((domain) => tokenAllowedDomains.includes(domain.id));
  }

  // 根据域名类型过滤
  if (domain_type && domain_type !== 'all') {
    domains = domains.filter((domain) => {
      const normalized = domain.name.replace(/\.$/, '');
      // 使用 getRootDomain 来正确判断是否为顶域
      const rootDomain = getRootDomain(normalized);
      const isApex = normalized === rootDomain;

      if (domain_type === 'apex') {
        return isApex;
      } else if (domain_type === 'subdomain') {
        return !isApex;
      }
      return true;
    });
  }

  if (!isSuper(role)) {
    domains = await Promise.all(domains.map(async (domain) => {
      const access = await resolveDomainAccess(domain, userId, role);
      return access.canRead ? domain : null;
    })).then(results => results.filter((d): d is Domain => d !== null));
  }

  // Calculate pagination
  const total = domains.length;
  const totalPages = Math.ceil(total / size);
  const startIndex = (currentPage - 1) * size;
  const endIndex = Math.min(startIndex + size, total);
  const paginatedDomains = domains.slice(startIndex, endIndex);

  // Record count is cached in database and refreshed asynchronously by background job
  // No need to query DNS provider API on every request

  // Return format based on query parameter or token usage
  // For external adapters (ddns-go, certd), return direct array when format=array
  if (format === 'array' || tokenPayload) {
    sendSuccess(res, paginatedDomains);
  } else {
    sendSuccess(res, { list: paginatedDomains, total, page: currentPage, pageSize: size, totalPages });
  }
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
    const existing = await DomainOperations.getByAccountIdAndName(account_id, item.name);
    if (existing) {
      await DomainOperations.updateThirdIdAndRecordCount(existing.id as number, item.third_id || '', item.record_count ?? 0);
      duplicates.push(item.name);
      continue;
    }
    try {
      const id = await DomainOperations.create({
        account_id,
        name: item.name,
        third_id: item.third_id || '',
        record_count: item.record_count ?? 0,
      });
      if (firstId === null) firstId = id;
      added++;
      addedDomains.push(item.name);
      
      // 异步获取 WHOIS 信息（不阻塞响应）
      syncDomainWhois(id).catch(err => {
        log.warn('Domains', `Failed to sync WHOIS for ${item.name}:`, { error: err });
      });
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
    await logAuditOperation(req.user!.userId, 'add_domain', domainName, { accountId: account_id }, req);
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

    // 分页获取所有域名
    const allDomains: Array<{ Domain: string; ThirdId: string; RecordCount?: number }> = [];
    let page = 1;
    const pageSize = 50;
    let hasMore = true;

    const maxPages = 2000; // 最大页数限制（2000页 x 50个 = 10万个）

    while (hasMore) {
      try {
        const result = await dnsAdapter.getDomainList(undefined, page, pageSize);
        allDomains.push(...result.list);
        // 改进的分页判断：当返回数据少于pageSize，或已达到/超过预期总数时停止
        hasMore = result.list.length === pageSize && (page - 1) * pageSize + result.list.length < result.total;
        page++;

        // 安全限制：最多获取10万个域名或2000页防止无限循环
        if (allDomains.length >= 100000 || page > maxPages) {
          log.warn('Domains', `Sync domain limit reached (${allDomains.length} domains, ${page} pages), stopping pagination`);
          break;
        }
      } catch (error) {
        log.error('Domains', `Failed to fetch page ${page}:`, { error });
        break;
      }
    }

    log.info('Domains', `Sync fetched ${allDomains.length} domains from provider`, { accountId: account_id, provider: account.type });

    let added = 0;
    for (const d of allDomains) {
      const normalizedName = normalizeDomainName(d.Domain);
      const existing = await DomainOperations.getByAccountIdAndName(account_id, normalizedName);
      if (!existing) {
        const id = await DomainOperations.create({
          account_id,
          name: normalizedName,
          third_id: d.ThirdId,
          record_count: d.RecordCount ?? 0,
        });
        added++;
        await logAuditOperation(req.user!.userId, 'sync_add_domain', normalizedName, { accountId: account_id }, req);

        // 异步获取 WHOIS 信息（不阻塞响应）
        syncDomainWhois(id).catch(err => {
          log.warn('Domains', `Failed to sync WHOIS for ${normalizedName}:`, { error: err });
        });
      } else {
        await DomainOperations.updateThirdIdAndRecordCount(existing.id as number, d.ThirdId || '', d.RecordCount ?? 0);
      }
    }
    await logAuditOperation(req.user!.userId, 'sync_domains', '', { accountId: account_id, total: allDomains.length, added }, req);
    sendSuccess(res, { total: allDomains.length, added });
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

    // 分页获取所有域名
    const allProviderDomains: Array<{ Domain: string; ThirdId: string; RecordCount?: number }> = [];
    let page = 1;
    const pageSize = 50;
    let hasMore = true;
    const maxPages = 2000;

    while (hasMore) {
      try {
        const result = await dnsAdapter.getDomainList(undefined, page, pageSize);
        allProviderDomains.push(...result.list);
        hasMore = result.list.length === pageSize && (page - 1) * pageSize + result.list.length < result.total;
        page++;

        if (allProviderDomains.length >= 100000 || page > maxPages) {
          log.warn('ProviderList', `Domain limit reached (${allProviderDomains.length} domains, ${page} pages), stopping pagination`);
          break;
        }
      } catch (error) {
        log.error('ProviderList', `Failed to fetch page ${page}:`, { error });
        break;
      }
    }

    log.info('ProviderList', 'Domains fetched', { total: allProviderDomains.length });

    // 获取当前账号下已添加的域名列表
    const existingDomains = await DomainOperations.getByAccountId(accountId) as Array<{ name: string }>;
    const existingDomainNames = new Set(existingDomains.map((d) => normalizeDomainName(d.name)));

    // 过滤掉已添加的域名（不限制数量，展示所有可同步的域名）
    const domains = allProviderDomains
      .map((d) => ({
        name: normalizeDomainName(d.Domain),
        third_id: d.ThirdId,
        record_count: d.RecordCount ?? 0,
      }))
      .filter((d) => !existingDomainNames.has(d.name));

    log.info('ProviderList', 'Filtered domains', { total: allProviderDomains.length, filtered: domains.length, existing: existingDomainNames.size });
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
router.put('/:id', authMiddleware, requireTokenDomainPermission(), asyncHandler(async (req: Request, res: Response) => {
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
  await DomainOperations.updateRemarkAndHidden(id, remark, is_hidden);
  await logAuditOperation(req.user!.userId, 'update_domain', access.domain.name, { remark, is_hidden }, req);
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
router.delete('/:id', authMiddleware, requireTokenDomainPermission(), asyncHandler(async (req: Request, res: Response) => {
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
  await DomainOperations.delete(id);
  await logAuditOperation(req.user!.userId, 'delete_domain', access.domain.name, { domainId: id, accountId: access.domain.account_id }, req);
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
  const account = await DnsAccountOperations.getById(access.domain.account_id) as DnsAccount | undefined;
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

router.post('/:id/failover', authMiddleware, requireTokenDomainPermission(), asyncHandler(async (req: Request, res: Response) => {
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

router.put('/:id/failover', authMiddleware, requireTokenDomainPermission(), asyncHandler(async (req: Request, res: Response) => {
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

router.delete('/:id/failover', authMiddleware, requireTokenDomainPermission(), asyncHandler(async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/domains/{id}/whois:
 *   post:
 *     summary: Refresh WHOIS info for domain
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
 *         description: WHOIS refreshed
 */
router.post('/:id/whois', authMiddleware, requireTokenDomainPermission(), asyncHandler(async (req: Request, res: Response) => {
  const id = parseInteger(req.params.id) ?? 0;
  const access = await getDomainAccess(id, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    sendError(res, 'Domain not found');
    return;
  }
  
  const result = await syncDomainWhois(id);
  
  if (result.success) {
    sendSuccess(res, { 
      expires_at: result.expiresAt?.toISOString(),
      apex_expires_at: result.apexExpiresAt?.toISOString(),
    }, 'WHOIS info refreshed successfully');
  } else {
    sendError(res, result.message || 'Failed to refresh WHOIS info');
  }
}));

/**
 * Renew a DNSHE subdomain
 */
router.post('/:id/renew', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = parseInteger(req.params.id);
  const { subdomain_id } = req.body;
  
  if (!id || !subdomain_id) {
    sendError(res, 'Missing domain ID or subdomain ID');
    return;
  }
  
  const access = await resolveDomainAccessById(id, req.user!.userId, normalizeRole(req.user?.role));
  if (!access.domain || !access.canWrite) {
    sendError(res, 'Domain not found or no permission');
    return;
  }
  
  // Get the account
  const account = await DnsAccountOperations.getById(access.domain.account_id) as DnsAccount | undefined;
  if (!account) {
    sendError(res, 'Account not found');
    return;
  }
  
  // Only support DNSHE provider
  if (account.type !== 'dnshe') {
    sendError(res, 'Renewal only supported for DNSHE provider');
    return;
  }
  
  try {
    const config = typeof account.config === 'string' ? JSON.parse(account.config) : account.config;
    const result = await dnsheRenewSubdomain(
      {
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        useProxy: !!config.useProxy,
      },
      Number(subdomain_id)
    );
    
    if (!result) {
      sendError(res, 'Renewal failed');
      return;
    }
    
    // Log audit operation
    await logAuditOperation(
      req.user!.userId,
      'renew_domain',
      access.domain.name,
      {
        subdomain_id: result.subdomain_id,
        subdomain: result.subdomain,
        previous_expires_at: result.previous_expires_at,
        new_expires_at: result.new_expires_at,
        remaining_days: result.remaining_days,
      },
      req
    );
    
    sendSuccess(res, result, 'Domain renewed successfully');
  } catch (error) {
    log.error('Domains', 'Renewal failed', { error });
    sendError(res, error instanceof Error ? error.message : 'Renewal failed');
  }
}));

/**
 * Get WHOIS information for a domain (DNSHE only)
 */
router.get('/whois', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { domain, accountId } = req.query;
  
  if (!domain || typeof domain !== 'string') {
    sendError(res, 'Domain parameter is required');
    return;
  }
  
  let dbDomain: Domain | undefined;
  
  if (accountId) {
    // 如果指定了 accountId，精确查询
    dbDomain = await DomainOperations.getByAccountIdAndName(
      Number(accountId),
      domain
    ) as Domain | undefined;
    
    if (!dbDomain) {
      sendError(res, 'Domain not found in specified account');
      return;
    }
  } else {
    // 未指定 accountId，查询第一条记录
    dbDomain = await DomainOperations.getByName(domain) as Domain | undefined;
    
    if (!dbDomain) {
      sendError(res, 'Domain not found');
      return;
    }
    
    // 检查用户是否有权限访问这个域名
    const access = await resolveDomainAccessById(dbDomain.id, req.user!.userId, normalizeRole(req.user?.role));
    
    if (!access.domain || !access.canRead) {
      // 如果第一条记录无权限，尝试查找用户有权限的其他同名域名
      const userDomains = await DomainOperations.getAll() as unknown as Domain[];
      const accessibleDomains = userDomains.filter((d: Domain) => d.name === domain);
      
      let foundAccessible = false;
      for (const candidateDomain of accessibleDomains) {
        const candidateAccess = await resolveDomainAccessById(
          candidateDomain.id,
          req.user!.userId,
          normalizeRole(req.user?.role)
        );
        
        if (candidateAccess.domain && candidateAccess.canRead) {
          dbDomain = candidateDomain;
          foundAccessible = true;
          break;
        }
      }
      
      if (!foundAccessible) {
        sendError(res, 'No permission to access this domain');
        return;
      }
    }
  }
  
  // Get the account
  const account = await DnsAccountOperations.getById(dbDomain.account_id) as DnsAccount | undefined;
  if (!account) {
    sendError(res, 'Account not found');
    return;
  }
  
  // Only support DNSHE provider
  if (account.type !== 'dnshe') {
    sendError(res, 'WHOIS query only supported for DNSHE provider');
    return;
  }
  
  try {
    const config = typeof account.config === 'string' ? JSON.parse(account.config) : account.config;
    const result = await dnsheGetWhois(
      {
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        useProxy: !!config.useProxy,
      },
      domain
    );
    
    if (!result) {
      sendError(res, 'WHOIS query failed');
      return;
    }
    
    sendSuccess(res, result);
  } catch (error) {
    log.error('Domains', 'WHOIS query failed', { error });
    sendError(res, error instanceof Error ? error.message : 'WHOIS query failed');
  }
}));

/**
 * Get renewable domains from all providers that support renewal
 * This endpoint queries the database for domains with expiry information
 */
router.get('/renewable-domains', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // Only allow admins and super admins
  const role = normalizeRole(req.user?.role);
  if (role < 2) {
    sendError(res, 'Permission denied');
    return;
  }
  
  try {
    // Query from renewable_domains table
    const renewableDomains = await RenewableDomainOperations.getAllEnabled();
    
    // Enrich with account information
    const enrichedDomains = await Promise.all(
      renewableDomains.map(async (domain: any) => {
        const account = await DnsAccountOperations.getById(domain.account_id);
        return {
          id: domain.id,
          name: domain.full_domain,
          full_domain: domain.full_domain,
          account_id: domain.account_id,
          account_name: account?.name || 'Unknown',
          provider_type: domain.provider_type,
          expires_at: domain.expires_at,
          third_id: domain.third_id,
          remark: domain.remark,
          enabled: domain.enabled,
          last_renewed_at: domain.last_renewed_at,
        };
      })
    );
    
    sendSuccess(res, enrichedDomains);
  } catch (error) {
    log.error('Domains', 'Failed to fetch renewable domains', { error });
    sendError(res, 'Failed to fetch renewable domains');
  }
}));

/**
 * Add a domain to renewable list (admin only)
 */
router.post('/renewable-domains', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // Only allow admins and super admins
  const role = normalizeRole(req.user?.role);
  if (role < 2) {
    sendError(res, 'Permission denied');
    return;
  }
  
  const { account_id, provider_type, domain_name, third_id, full_domain, expires_at, remark } = req.body as {
    account_id: number;
    provider_type: string;
    domain_name: string;
    third_id: string;
    full_domain: string;
    expires_at?: string;
    remark?: string;
  };
  
  if (!account_id || !provider_type || !domain_name || !third_id || !full_domain) {
    sendError(res, 'Missing required fields');
    return;
  }
  
  try {
    const id = await RenewableDomainOperations.add({
      account_id,
      provider_type,
      domain_name,
      third_id,
      full_domain,
      expires_at,
      remark,
    });
    
    log.info('Domains', 'Added renewable domain', { id, full_domain });
    sendSuccess(res, { id });
  } catch (error) {
    log.error('Domains', 'Failed to add renewable domain', { error });
    sendError(res, 'Failed to add renewable domain');
  }
}));

/**
 * Delete a domain from renewable list (admin only)
 */
router.delete('/renewable-domains/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // Only allow admins and super admins
  const role = normalizeRole(req.user?.role);
  if (role < 2) {
    sendError(res, 'Permission denied');
    return;
  }
  
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    sendError(res, 'Invalid ID');
    return;
  }
  
  try {
    await RenewableDomainOperations.delete(id);
    log.info('Domains', 'Deleted renewable domain', { id });
    sendSuccess(res, null);
  } catch (error) {
    log.error('Domains', 'Failed to delete renewable domain', { error });
    sendError(res, 'Failed to delete renewable domain');
  }
}));

/**
 * Sync domains from provider to renewable list (admin only)
 */
router.post('/renewable-domains/sync', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // Only allow admins and super admins
  const role = normalizeRole(req.user?.role);
  if (role < 2) {
    sendError(res, 'Permission denied');
    return;
  }
  
  const { account_id, domain_ids } = req.body as {
    account_id: number;
    domain_ids: Array<{
      id: string | number;
      full_domain: string;
      name?: string;
      expires_at?: string;
    }>;
  };
  
  if (!account_id || !Array.isArray(domain_ids) || domain_ids.length === 0) {
    sendError(res, 'Missing required fields');
    return;
  }
  
  try {
    // Get account info
    const account = await DnsAccountOperations.getById(account_id);
    if (!account) {
      sendError(res, 'Account not found');
      return;
    }
    
    // Add domains to renewable list
    const domainsToAdd = domain_ids.map(d => ({
      account_id,
      provider_type: String(account.type),
      domain_name: d.name || d.full_domain.split('.')[0],
      third_id: String(d.id),
      full_domain: d.full_domain,
      expires_at: d.expires_at,
      remark: `Synced from ${account.name}`,
    }));
    
    const addedCount = await RenewableDomainOperations.addBatch(domainsToAdd);
    
    log.info('Domains', 'Synced renewable domains', { 
      accountId: account_id, 
      addedCount,
      totalCount: domain_ids.length 
    });
    
    sendSuccess(res, { addedCount, total: domain_ids.length });
  } catch (error) {
    log.error('Domains', 'Failed to sync renewable domains', { error });
    sendError(res, 'Failed to sync domains');
  }
}));

export { canAccessDomain, getAccountForUser };
export default router;
