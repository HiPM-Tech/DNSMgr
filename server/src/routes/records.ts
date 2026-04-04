import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { createAdapter } from '../lib/dns/DnsHelper';
import { DnsAccount, Domain } from '../types';
import { type DnsRecord as AdapterRecord } from '../lib/dns/DnsInterface';
import { canAccessDomain } from './domains';

function toApiRecord(r: AdapterRecord) {
  const cloudflare = r.Cloudflare ?? (r.Proxiable !== undefined
    ? { proxied: r.Line === '1', proxiable: r.Proxiable }
    : null);

  return {
    id: r.RecordId,
    name: r.Name,
    type: r.Type,
    value: r.Value,
    line: r.Line,
    ttl: r.TTL,
    mx: r.MX,
    weight: r.Weight,
    status: r.Status,
    proxiable: r.Proxiable ?? null,
    cloudflare,
    remark: r.Remark ?? null,
    updated_at: r.UpdateTime ?? null,
  };
}

function isIPv4(value: string): boolean {
  const parts = value.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function isIPv6(value: string): boolean {
  const normalized = value.trim();
  if (!normalized || !normalized.includes(':')) return false;
  try {
    return new URL(`http://[${normalized}]`).hostname === `[${normalized}]`;
  } catch {
    return false;
  }
}

function isHostname(value: string): boolean {
  const normalized = value.trim().replace(/\.$/, '');
  if (!normalized || normalized.length > 253) return false;
  return normalized.split('.').every((label) =>
    label.length > 0 &&
    label.length <= 63 &&
    /^[a-zA-Z0-9-]+$/.test(label) &&
    !label.startsWith('-') &&
    !label.endsWith('-')
  );
}

function validateRecordPayload(type: string, value: string, mx?: number, weight?: number): string | null {
  if (type === 'A' && !isIPv4(value)) return 'A record must use a valid IPv4 address';
  if (type === 'AAAA' && !isIPv6(value)) return 'AAAA record must use a valid IPv6 address';
  if (['CNAME', 'MX', 'NS', 'PTR', 'HTTPS'].includes(type) && !isHostname(value)) {
    return `${type} record must use a valid hostname`;
  }
  if (type === 'MX' && mx !== undefined && mx < 0) return 'MX priority must be 0 or greater';
  if (type === 'SRV') {
    const parts = value.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2 || !/^\d+$/.test(parts[0]) || Number(parts[0]) < 1 || Number(parts[0]) > 65535 || !isHostname(parts.slice(1).join(' '))) {
      return 'SRV record must use "port target" format with a valid target hostname';
    }
    if (mx !== undefined && mx < 0) return 'SRV priority must be 0 or greater';
    if (weight !== undefined && weight < 0) return 'SRV weight must be 0 or greater';
  }
  return null;
}

const router = Router({ mergeParams: true });

function getAdapterForDomain(domain: Domain) {
  const db = getDb();
  const account = db.prepare('SELECT * FROM dns_accounts WHERE id = ?').get(domain.account_id) as DnsAccount | undefined;
  if (!account) throw new Error('Account not found');
  const cfg = JSON.parse(account.config) as Record<string, string>;
  return createAdapter(account.type, cfg, domain.name, domain.third_id);
}

function logOperation(userId: number, action: string, domainName: string, data: unknown): void {
  getDb().prepare('INSERT INTO operation_logs (user_id, action, domain, data) VALUES (?, ?, ?, ?)').run(
    userId, action, domainName, JSON.stringify(data)
  );
}

function updateDomainRecordCount(domainId: number, count: number): void {
  getDb().prepare('UPDATE domains SET record_count = ? WHERE id = ?').run(count, domainId);
}

async function refreshDomainRecordCount(domain: Domain, adapter = getAdapterForDomain(domain)): Promise<number> {
  const result = await adapter.getDomainRecords(1, 1);
  updateDomainRecordCount(domain.id, result.total);
  return result.total;
}

/**
 * @swagger
 * /api/domains/{domainId}/records:
 *   get:
 *     summary: List DNS records for a domain
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: domainId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *       - in: query
 *         name: subdomain
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: value
 *         schema:
 *           type: string
 *       - in: query
 *         name: line
 *         schema:
 *           type: string
 *         description: Legacy compatibility field. For Cloudflare prefer `cloudflare.proxied` in write payloads.
 *       - in: query
 *         name: status
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of DNS records
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const domainId = parseInt(req.params.domainId);
  const domain = canAccessDomain(domainId, req.user!.userId, req.user!.role);
  if (!domain) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  const { page = '1', pageSize = '100', keyword, subdomain, value, type, line, status } = req.query as Record<string, string>;
  try {
    const adapter = getAdapterForDomain(domain);
    const result = await adapter.getDomainRecords(
      parseInt(page), parseInt(pageSize), keyword, subdomain, value, type, line,
      status !== undefined ? parseInt(status) : undefined
    );
    updateDomainRecordCount(domain.id, result.total);
    res.json({ code: 0, data: { total: result.total, list: result.list.map(toApiRecord) }, msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * @swagger
 * /api/domains/{domainId}/records:
 *   post:
 *     summary: Add a DNS record
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: domainId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type, value]
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *               value:
 *                 type: string
 *               line:
 *                 type: string
 *                 description: Legacy compatibility field (`0`=DNS only, `1`=proxied). For Cloudflare prefer `cloudflare.proxied`.
 *               cloudflare:
 *                 type: object
 *                 properties:
 *                   proxied:
 *                     type: boolean
 *                     description: Cloudflare-only proxy switch. When present, it takes precedence over `line`.
 *               ttl:
 *                 type: integer
 *               mx:
 *                 type: integer
 *               weight:
 *                 type: integer
 *               remark:
 *                 type: string
 *     responses:
 *       200:
 *         description: Record created
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const domainId = parseInt(req.params.domainId);
  const domain = canAccessDomain(domainId, req.user!.userId, req.user!.role);
  if (!domain) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  const { name, type, value, line, ttl, mx, weight, remark, cloudflare } = req.body as {
    name: string; type: string; value: string; line?: string;
    ttl?: number; mx?: number; weight?: number; remark?: string;
    cloudflare?: { proxied?: boolean };
  };
  if (!name || !type || !value) {
    res.json({ code: -1, msg: 'name, type, and value are required' });
    return;
  }
  const validationError = validateRecordPayload(type, value, mx, weight);
  if (validationError) {
    res.json({ code: -1, msg: validationError });
    return;
  }
  try {
    const adapter = getAdapterForDomain(domain);
    const resolvedLine = cloudflare?.proxied === undefined ? line : (cloudflare.proxied ? '1' : '0');
    const recordId = await adapter.addDomainRecord(name, type, value, resolvedLine, ttl, mx, weight, remark);
    if (!recordId) {
      res.json({ code: -1, msg: 'Failed to add record' });
      return;
    }
    await refreshDomainRecordCount(domain, adapter);
    logOperation(req.user!.userId, 'add_record', domain.name, { name, type, value, recordId });
    res.json({ code: 0, data: { recordId }, msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * @swagger
 * /api/domains/{domainId}/records/{recordId}:
 *   get:
 *     summary: Get DNS record info
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: domainId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: recordId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Record info
 */
router.get('/:recordId', authMiddleware, async (req: Request, res: Response) => {
  const domainId = parseInt(req.params.domainId);
  const domain = canAccessDomain(domainId, req.user!.userId, req.user!.role);
  if (!domain) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  try {
    const adapter = getAdapterForDomain(domain);
    const record = await adapter.getDomainRecordInfo(req.params.recordId);
    if (!record) {
      res.json({ code: -1, msg: 'Record not found' });
      return;
    }
    res.json({ code: 0, data: toApiRecord(record), msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * @swagger
 * /api/domains/{domainId}/records/{recordId}:
 *   put:
 *     summary: Update a DNS record
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: domainId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: recordId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type, value]
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *               value:
 *                 type: string
 *               line:
 *                 type: string
 *                 description: Legacy compatibility field (`0`=DNS only, `1`=proxied). For Cloudflare prefer `cloudflare.proxied`.
 *               cloudflare:
 *                 type: object
 *                 properties:
 *                   proxied:
 *                     type: boolean
 *                     description: Cloudflare-only proxy switch. When present, it takes precedence over `line`.
 *               ttl:
 *                 type: integer
 *               mx:
 *                 type: integer
 *               weight:
 *                 type: integer
 *               remark:
 *                 type: string
 *     responses:
 *       200:
 *         description: Record updated
 */
router.put('/:recordId', authMiddleware, async (req: Request, res: Response) => {
  const domainId = parseInt(req.params.domainId);
  const domain = canAccessDomain(domainId, req.user!.userId, req.user!.role);
  if (!domain) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  const { name, type, value, line, ttl, mx, weight, remark, cloudflare } = req.body as {
    name: string; type: string; value: string; line?: string;
    ttl?: number; mx?: number; weight?: number; remark?: string;
    cloudflare?: { proxied?: boolean };
  };
  if (!name || !type || !value) {
    res.json({ code: -1, msg: 'name, type, and value are required' });
    return;
  }
  const validationError = validateRecordPayload(type, value, mx, weight);
  if (validationError) {
    res.json({ code: -1, msg: validationError });
    return;
  }
  try {
    const adapter = getAdapterForDomain(domain);
    const resolvedLine = cloudflare?.proxied === undefined ? line : (cloudflare.proxied ? '1' : '0');
    const ok = await adapter.updateDomainRecord(req.params.recordId, name, type, value, resolvedLine, ttl, mx, weight, remark);
    if (!ok) {
      res.json({ code: -1, msg: 'Failed to update record' });
      return;
    }
    logOperation(req.user!.userId, 'update_record', domain.name, { recordId: req.params.recordId, name, type, value });
    res.json({ code: 0, msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * @swagger
 * /api/domains/{domainId}/records/{recordId}:
 *   delete:
 *     summary: Delete a DNS record
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: domainId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: recordId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Record deleted
 */
router.delete('/:recordId', authMiddleware, async (req: Request, res: Response) => {
  const domainId = parseInt(req.params.domainId);
  const domain = canAccessDomain(domainId, req.user!.userId, req.user!.role);
  if (!domain) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  try {
    const adapter = getAdapterForDomain(domain);
    const ok = await adapter.deleteDomainRecord(req.params.recordId);
    if (!ok) {
      res.json({ code: -1, msg: 'Failed to delete record' });
      return;
    }
    await refreshDomainRecordCount(domain, adapter);
    logOperation(req.user!.userId, 'delete_record', domain.name, { recordId: req.params.recordId });
    res.json({ code: 0, msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * @swagger
 * /api/domains/{domainId}/records/{recordId}/status:
 *   put:
 *     summary: Toggle record status (enable/disable)
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: domainId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: recordId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: integer
 *                 description: 1=enabled, 0=disabled
 *     responses:
 *       200:
 *         description: Status updated
 */
router.put('/:recordId/status', authMiddleware, async (req: Request, res: Response) => {
  const domainId = parseInt(req.params.domainId);
  const domain = canAccessDomain(domainId, req.user!.userId, req.user!.role);
  if (!domain) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  const { status } = req.body as { status: number };
  if (status === undefined || status === null) {
    res.json({ code: -1, msg: 'status is required' });
    return;
  }
  try {
    const adapter = getAdapterForDomain(domain);
    const ok = await adapter.setDomainRecordStatus(req.params.recordId, status);
    if (!ok) {
      res.json({ code: -1, msg: 'Failed to update record status' });
      return;
    }
    logOperation(req.user!.userId, 'set_record_status', domain.name, { recordId: req.params.recordId, status });
    res.json({ code: 0, msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
