import { Router, Request, Response } from 'express';
import { getAdapter } from '../db/adapter';
import { authMiddleware } from '../middleware/auth';
import { createAdapter } from '../lib/dns/DnsHelper';
import { DnsAccount, Domain } from '../types';
import { type DnsRecord as AdapterRecord } from '../lib/dns/DnsInterface';
import { getDomainAccess } from './domains';
import { normalizeRole } from '../utils/roles';

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
  const adapter = getAdapter();
  if (!adapter) throw new Error('Database error');
  const account = await adapter.get('SELECT * FROM dns_accounts WHERE id = ?', [domain.account_id]) as DnsAccount | undefined;
  if (!account) throw new Error('Account not found');
  const cfg = JSON.parse(account.config) as Record<string, string>;
  return createAdapter(account.type, cfg, domain.name, domain.third_id);
}

async function updateDomainRecordCount(domainId: number, count: number): Promise<void> {
  const adapter = getAdapter();
  if (!adapter) return;
  await adapter.execute('UPDATE domains SET record_count = ? WHERE id = ?', [count, domainId]);
}

async function logOperation(userId: number, action: string, domainName: string, data: unknown): Promise<void> {
  const adapter = getAdapter();
  if (!adapter) return;
  await adapter.execute(
    'INSERT INTO operation_logs (user_id, action, domain, data) VALUES (?, ?, ?, ?)',
    [userId, action, domainName, JSON.stringify(data)]
  );
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
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const domainId = parseInt(req.params.domainId);
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    res.json({ code: -1, msg: 'Domain not found' });
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
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const domainId = parseInt(req.params.domainId);
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  if (!access.canWrite) {
    res.json({ code: -1, msg: 'Permission denied' });
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
  if (!canWriteSubdomain(access.writeSubs, name, access.domain.name)) {
    res.json({ code: -1, msg: 'Permission denied for subdomain' });
    return;
  }
  if (!isValidRecordValue(type, value)) {
    res.json({ code: -1, msg: `Invalid value for ${type} record` });
    return;
  }
  try {
    const dnsAdapter = await getAdapterForDomain(access.domain);
    const recordId = await dnsAdapter.addDomainRecord(name, type, value, line, ttl, mx, weight, remark);
    if (!recordId) {
      res.json({ code: -1, msg: 'Failed to add record' });
      return;
    }
    await logOperation(req.user!.userId, 'add_record', access.domain.name, { name, type, value });
    res.json({ code: 0, data: { id: recordId }, msg: 'success' });
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
 */
router.put('/:recordId', authMiddleware, async (req: Request, res: Response) => {
  const domainId = parseInt(req.params.domainId);
  const recordId = req.params.recordId;
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  if (!access.canWrite) {
    res.json({ code: -1, msg: 'Permission denied' });
    return;
  }
  const { name, type, value, line, ttl, mx, weight, remark, status, cloudflare } = req.body as {
    name?: string; type?: string; value?: string; line?: string;
    ttl?: number; mx?: number; weight?: number; remark?: string; status?: number;
    cloudflare?: { proxied?: boolean };
  };
  if (!name || !type || !value) {
    res.json({ code: -1, msg: 'name, type, and value are required' });
    return;
  }
  if (!canWriteSubdomain(access.writeSubs, name, access.domain.name)) {
    res.json({ code: -1, msg: 'Permission denied for subdomain' });
    return;
  }
  if (!isValidRecordValue(type, value)) {
    res.json({ code: -1, msg: `Invalid value for ${type} record` });
    return;
  }
  try {
    const dnsAdapter = await getAdapterForDomain(access.domain);
    const success = await dnsAdapter.updateDomainRecord(recordId, name, type, value, line, ttl, mx, weight, remark);
    if (!success) {
      res.json({ code: -1, msg: 'Failed to update record' });
      return;
    }
    await logOperation(req.user!.userId, 'update_record', access.domain.name, { recordId, name, type, value });
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
 */
router.delete('/:recordId', authMiddleware, async (req: Request, res: Response) => {
  const domainId = parseInt(req.params.domainId);
  const recordId = req.params.recordId;
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  if (!access.canWrite) {
    res.json({ code: -1, msg: 'Permission denied' });
    return;
  }
  try {
    const dnsAdapter = await getAdapterForDomain(access.domain);
    // Only scoped writers need subdomain ownership verification.
    // Users with full-domain write permission can delete directly.
    if (access.writeSubs !== null) {
      const targetRecord = await dnsAdapter.getDomainRecordInfo(recordId);
      if (!targetRecord) {
        res.json({ code: -1, msg: 'Record not found' });
        return;
      }
      if (!canWriteSubdomain(access.writeSubs, targetRecord.Name, access.domain.name)) {
        res.json({ code: -1, msg: 'Permission denied for subdomain' });
        return;
      }
    }
    const success = await dnsAdapter.deleteDomainRecord(recordId);
    if (!success) {
      res.json({ code: -1, msg: 'Failed to delete record' });
      return;
    }
    await logOperation(req.user!.userId, 'delete_record', access.domain.name, { recordId });
    res.json({ code: 0, msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * @swagger
 * /api/domains/{domainId}/records/{recordId}/status:
 *   put:
 *     summary: Enable/disable a DNS record
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:recordId/status', authMiddleware, async (req: Request, res: Response) => {
  const domainId = parseInt(req.params.domainId);
  const recordId = req.params.recordId;
  const access = await getDomainAccess(domainId, req.user!.userId, normalizeRole(req.user!.role));
  if (!access.domain || !access.canRead) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  if (!access.canWrite) {
    res.json({ code: -1, msg: 'Permission denied' });
    return;
  }
  const { status } = req.body as { status: number };
  if (status !== 0 && status !== 1) {
    res.json({ code: -1, msg: 'status must be 0 or 1' });
    return;
  }
  try {
    const dnsAdapter = await getAdapterForDomain(access.domain);
    const success = await dnsAdapter.setDomainRecordStatus(recordId, status);
    if (!success) {
      res.json({ code: -1, msg: 'Failed to update record status' });
      return;
    }
    await logOperation(req.user!.userId, status === 1 ? 'enable_record' : 'disable_record', access.domain.name, { recordId });
    res.json({ code: 0, msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
