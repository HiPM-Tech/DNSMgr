import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { db } from '../db';
import { CloudflareAdapter } from '../lib/dns/providers';
import { DnsAccount } from '../types';
import { isSuper, normalizeRole } from '../utils/roles';

const router = Router();

async function getAccessibleCloudflareAccounts(userId: number, role: number): Promise<DnsAccount[]> {
  if (isSuper(role)) {
    return await db.query<DnsAccount>("SELECT * FROM dns_accounts WHERE type = 'cloudflare'");
  }
  
  const teamMembers = await db.query<{ team_id: number }>('SELECT team_id FROM team_members WHERE user_id = ?', [userId]);
  const teamIds = teamMembers.map((r) => r.team_id);
  
  if (teamIds.length > 0) {
    const placeholders = teamIds.map(() => '?').join(',');
    return await db.query<DnsAccount>(
      `SELECT * FROM dns_accounts WHERE type = 'cloudflare' AND (created_by = ? OR team_id IN (${placeholders}))`,
      [userId, ...teamIds]
    );
  }
  
  return await db.query<DnsAccount>(
    "SELECT * FROM dns_accounts WHERE type = 'cloudflare' AND created_by = ?",
    [userId]
  );
}

async function getCloudflareAccountByTunnelId(accountId: string, userId: number, role: number): Promise<DnsAccount | null> {
  const accounts = await getAccessibleCloudflareAccounts(userId, role);
  for (const acc of accounts) {
    try {
      // MySQL JSON type returns object directly, SQLite/PostgreSQL returns string
      const cfg = typeof acc.config === 'string' ? JSON.parse(acc.config) : acc.config;
      if (cfg.accountId === accountId) return acc;
    } catch {}
  }
  return null;
}

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const accounts = await getAccessibleCloudflareAccounts(req.user!.userId, normalizeRole(req.user?.role));

    const allTunnels: any[] = [];
    for (const acc of accounts) {
      // MySQL JSON type returns object directly, SQLite/PostgreSQL returns string
      const cfg = typeof acc.config === 'string' ? JSON.parse(acc.config) : acc.config;
      if (!cfg.accountId) continue;
      const cf = new CloudflareAdapter(cfg);
      const tunnels = await cf.getTunnels(cfg.accountId);
      if (tunnels) {
        allTunnels.push(...tunnels.map((t: any) => ({ ...t, account_name: acc.name, account_id: cfg.accountId })));
      }
    }
    res.json({ code: 0, data: allTunnels, msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/:accountId/:tunnelId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const acc = await getCloudflareAccountByTunnelId(
      req.params.accountId,
      req.user!.userId,
      normalizeRole(req.user?.role)
    );
    if (!acc) return res.status(404).json({ code: 404, msg: 'Account not found' });
    
    // MySQL JSON type returns object directly, SQLite/PostgreSQL returns string
    const cfg = typeof acc.config === 'string' ? JSON.parse(acc.config) : acc.config;
    const cf = new CloudflareAdapter(cfg);
    const config = await cf.getTunnelConfig(req.params.accountId, req.params.tunnelId);
    res.json({ code: 0, data: config, msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

router.put('/:accountId/:tunnelId/config', authMiddleware, async (req: Request, res: Response) => {
  try {
    const acc = await getCloudflareAccountByTunnelId(
      req.params.accountId,
      req.user!.userId,
      normalizeRole(req.user?.role)
    );
    if (!acc) return res.status(404).json({ code: 404, msg: 'Account not found' });
    
    // MySQL JSON type returns object directly, SQLite/PostgreSQL returns string
    const cfg = typeof acc.config === 'string' ? JSON.parse(acc.config) : acc.config;
    const cf = new CloudflareAdapter(cfg);
    const success = await cf.updateTunnelConfig(req.params.accountId, req.params.tunnelId, req.body.config);
    if (success) {
      res.json({ code: 0, msg: 'success' });
    } else {
      res.json({ code: -1, msg: 'Failed to update tunnel config' });
    }
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

router.delete('/:accountId/:tunnelId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const acc = await getCloudflareAccountByTunnelId(
      req.params.accountId,
      req.user!.userId,
      normalizeRole(req.user?.role)
    );
    if (!acc) return res.status(404).json({ code: 404, msg: 'Account not found' });
    
    // MySQL JSON type returns object directly, SQLite/PostgreSQL returns string
    const cfg = typeof acc.config === 'string' ? JSON.parse(acc.config) : acc.config;
    const cf = new CloudflareAdapter(cfg);
    const success = await cf.deleteTunnel(req.params.accountId, req.params.tunnelId);
    if (success) {
      res.json({ code: 0, msg: 'success' });
    } else {
      res.json({ code: -1, msg: 'Failed to delete tunnel' });
    }
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
