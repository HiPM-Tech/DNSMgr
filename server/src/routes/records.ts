import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { createAdapter } from '../lib/dns/DnsHelper';
import { DnsAccount, Domain } from '../types';
import { type DnsRecord as AdapterRecord } from '../lib/dns/DnsInterface';
import { getDomainAccess } from './domains';
import { normalizeRole } from '../utils/roles';
import { logAuditOperation } from '../service/audit';
import { parseInteger, sendError, sendSuccess } from '../utils/http';
import { DomainOperations, DnsAccountOperations } from '../db/business-adapter';

const router = Router({ mergeParams: true });

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
  const labels = normalized.split('.');
  if (labels.some((l) => !l || l.length > 63 || /^[-]/.test(l) || /[-]$/.test(l) || /[^a-zA-Z0-9-]/.test(l))) return false;
  return true;
}

function isValidRecordValue(type: string, value: string): boolean {
  const t = type.trim().toUpperCase();
  const v = value.trim();
  switch (t) {
    case 'A': return isIPv4(v);
    case 'AAAA': return isIPv6(v);
    case 'CNAME':
    case 'NS':
    case 'MX':
    case 'SRV':
    case 'CAA':
    case 'PTR': return isHostname(v);
    case 'TXT': return v.length > 0 && v.length <= 4096;
    default: return v.length > 0;
  }
}

function getSubdomain(fullName: string, domainName: string): string {
  const full = fullName.trim().toLowerCase();
  const domain = domainName.trim().toLowerCase();
  if (full === domain) return '@';
  if (full.endsWith('.' + domain)) return full.slice(0, -(domain.length + 1));
  return full;
}

function canWriteSubdomain(writeSubs: string[] | null, fullName: string, domainName: string): boolean {
  if (writeSubs === null) return true;
  const sub = getSubdomain(fullName, domainName);
  return writeSubs.includes(sub);
}

async function getAdapterForDomain(domain: Domain) {
  const account = await DnsAccountOperations.getById(domain.account_id) as DnsAccount | undefined;
  if (!account) throw new Error('Account not found');
  // MySQL JSON type returns object directly, SQLite/PostgreSQL returns string
  const cfg = typeof account.config === 'string' ? JSON.parse(account.config) as Record<string, string> : account.config as Record<string, string>;
  return createAdapter(account.type, cfg, domain.name, domain.third_id);
}

async function updateDomainRecordCount(domainId: number, count: number): Promise<void> {
  await DomainOperations.updateRecordCount(domainId, count);
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
 *     responses:
 *       200:
 *         description: List of DNS records
 */
router.get('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const domainId = parseInteger(req.params.domainId) ?? 0;
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    sendError(res, 'Domain not found');
    return;
  }
  const { page = '1', pageSize = '100', keyword, subdomain, value, type, line, status } = req.query as Record<string, string>;
  try {
    const dnsAdapter = await getAdapterForDomain(access.domain);
    const result = await dnsAdapter.getDomainRecords(
      parseInt(page), parseInt(pageSize), keyword, subdomain, value, type, line,
      status !== undefined ? parseInt(status) : undefined
    );
    await updateDomainRecordCount(access.domain.id, result.total);
    sendSuccess(res, { total: result.total, list: result.list.map(toApiRecord) });
  } catch (e) {
    sendError(res, e instanceof Error ? e.message : String(e));
  }
}));

/**
 * @swagger
 * /api/domains/{domainId}/records:
 *   post:
 *     summary: Add a DNS record
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const domainId = parseInteger(req.params.domainId) ?? 0;
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    sendError(res, 'Domain not found');
    return;
  }
  if (!access.canWrite) {
    sendError(res, 'Permission denied');
    return;
  }
  const { name, type, value, line, ttl, mx, weight, remark, cloudflare } = req.body as {
    name: string; type: string; value: string; line?: string;
    ttl?: number; mx?: number; weight?: number; remark?: string;
    cloudflare?: { proxied?: boolean };
  };
  if (!name || !type || !value) {
    sendError(res, 'name, type, and value are required');
    return;
  }
  if (!canWriteSubdomain(access.writeSubs, name, access.domain.name)) {
    sendError(res, 'Permission denied for subdomain');
    return;
  }
  if (!isValidRecordValue(type, value)) {
    sendError(res, `Invalid value for ${type} record`);
    return;
  }
  try {
    const dnsAdapter = await getAdapterForDomain(access.domain);
    const recordId = await dnsAdapter.addDomainRecord(name, type, value, line, ttl, mx, weight, remark);
    if (!recordId) {
      sendError(res, 'Failed to add record');
      return;
    }
    await logAuditOperation(req.user!.userId, 'add_record', access.domain.name, { name, type, value });
    sendSuccess(res, { id: recordId });
  } catch (e) {
    sendError(res, e instanceof Error ? e.message : String(e));
  }
}));

router.post('/batch', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const domainId = parseInteger(req.params.domainId) ?? 0;
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    sendError(res, 'Domain not found');
    return;
  }
  if (!access.canWrite) {
    sendError(res, 'Permission denied');
    return;
  }
  
  const records = req.body.records as Array<{
    name: string; type: string; value: string; line?: string;
    ttl?: number; mx?: number; weight?: number; remark?: string;
  }>;
  
  if (!Array.isArray(records) || records.length === 0) {
    sendError(res, 'records array is required');
    return;
  }

  for (const r of records) {
    if (!r.name || !r.type || !r.value) {
      sendError(res, 'name, type, and value are required for all records');
      return;
    }
    if (!canWriteSubdomain(access.writeSubs, r.name, access.domain.name)) {
      sendError(res, `Permission denied for subdomain: ${r.name}`);
      return;
    }
    if (!isValidRecordValue(r.type, r.value)) {
      sendError(res, `Invalid value for ${r.type} record`);
      return;
    }
  }

  const dnsAdapter = await getAdapterForDomain(access.domain);
  const addedIds: string[] = [];
  const errors: string[] = [];
  
  for (const r of records) {
    try {
      const recordId = await dnsAdapter.addDomainRecord(r.name, r.type, r.value, r.line, r.ttl, r.mx, r.weight, r.remark);
      if (recordId) {
        addedIds.push(recordId);
      } else {
        errors.push(`Failed to add ${r.type} ${r.name}`);
      }
    } catch (e) {
      errors.push(`Error adding ${r.type} ${r.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (addedIds.length > 0) {
    await logAuditOperation(req.user!.userId, 'add_records_batch', access.domain.name, { count: addedIds.length });
  }
    
  if (errors.length > 0) {
    sendError(res, errors.join('; '), 200, { addedIds });
  } else {
    sendSuccess(res, { addedIds });
  }
}));

/**
 * @swagger
 * /api/domains/{domainId}/records/{recordId}:
 *   put:
 *     summary: Update a DNS record
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:recordId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const domainId = parseInteger(req.params.domainId) ?? 0;
  const recordId = req.params.recordId;
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    sendError(res, 'Domain not found');
    return;
  }
  if (!access.canWrite) {
    sendError(res, 'Permission denied');
    return;
  }
  const { name, type, value, line, ttl, mx, weight, remark, status, cloudflare } = req.body as {
    name?: string; type?: string; value?: string; line?: string;
    ttl?: number; mx?: number; weight?: number; remark?: string; status?: number;
    cloudflare?: { proxied?: boolean };
  };
  if (!name || !type || !value) {
    sendError(res, 'name, type, and value are required');
    return;
  }
  if (!canWriteSubdomain(access.writeSubs, name, access.domain.name)) {
    sendError(res, 'Permission denied for subdomain');
    return;
  }
  if (!isValidRecordValue(type, value)) {
    sendError(res, `Invalid value for ${type} record`);
    return;
  }
  try {
    const dnsAdapter = await getAdapterForDomain(access.domain);
    const success = await dnsAdapter.updateDomainRecord(recordId, name, type, value, line, ttl, mx, weight, remark);
    if (!success) {
      sendError(res, 'Failed to update record');
      return;
    }
    await logAuditOperation(req.user!.userId, 'update_record', access.domain.name, { recordId, name, type, value });
    sendSuccess(res);
  } catch (e) {
    sendError(res, e instanceof Error ? e.message : String(e));
  }
}));

/**
 * @swagger
 * /api/domains/{domainId}/records/{recordId}:
 *   delete:
 *     summary: Delete a DNS record
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:recordId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const domainId = parseInteger(req.params.domainId) ?? 0;
  const recordId = req.params.recordId;
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    sendError(res, 'Domain not found');
    return;
  }
  if (!access.canWrite) {
    sendError(res, 'Permission denied');
    return;
  }
  try {
    const dnsAdapter = await getAdapterForDomain(access.domain);
    // Only scoped writers need subdomain ownership verification.
    // Users with full-domain write permission can delete directly.
    if (access.writeSubs !== null) {
      const targetRecord = await dnsAdapter.getDomainRecordInfo(recordId);
      if (!targetRecord) {
        sendError(res, 'Record not found');
        return;
      }
      if (!canWriteSubdomain(access.writeSubs, targetRecord.Name, access.domain.name)) {
        sendError(res, 'Permission denied for subdomain');
        return;
      }
    }
    const success = await dnsAdapter.deleteDomainRecord(recordId);
    if (!success) {
      sendError(res, 'Failed to delete record');
      return;
    }
    await logAuditOperation(req.user!.userId, 'delete_record', access.domain.name, { recordId });
    sendSuccess(res);
  } catch (e) {
    sendError(res, e instanceof Error ? e.message : String(e));
  }
}));

/**
 * @swagger
 * /api/domains/{domainId}/records/{recordId}/status:
 *   put:
 *     summary: Enable/disable a DNS record
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:recordId/status', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const domainId = parseInteger(req.params.domainId) ?? 0;
  const recordId = req.params.recordId;
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    sendError(res, 'Domain not found');
    return;
  }
  if (!access.canWrite) {
    sendError(res, 'Permission denied');
    return;
  }
  const { status } = req.body as { status: number };
  if (status !== 0 && status !== 1) {
    sendError(res, 'status must be 0 or 1');
    return;
  }
  try {
    const dnsAdapter = await getAdapterForDomain(access.domain);
    const success = await dnsAdapter.setDomainRecordStatus(recordId, status);
    if (!success) {
      sendError(res, 'Failed to update record status');
      return;
    }
    await logAuditOperation(req.user!.userId, status === 1 ? 'enable_record' : 'disable_record', access.domain.name, { recordId });
    sendSuccess(res);
  } catch (e) {
    sendError(res, e instanceof Error ? e.message : String(e));
  }
}));

export default router;
