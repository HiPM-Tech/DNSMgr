import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getAdapter } from '../db/adapter';
import { CloudflareAdapter } from '../lib/dns/providers';
import { DnsAccount } from '../types';

const router = Router();

async function getCloudflareAccountByTunnelId(adapter: any, accountId: string): Promise<DnsAccount | null> {
  const accounts = await adapter.query("SELECT * FROM dns_accounts WHERE type = 'cloudflare'") as unknown as DnsAccount[];
  for (const acc of accounts) {
    try {
      const cfg = JSON.parse(acc.config);
      if (cfg.accountId === accountId) return acc;
    } catch {}
  }
  return null;
}

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const adapter = getAdapter();
  if (!adapter) {
    res.status(500).json({ code: 500, msg: 'Database error' });
    return;
  }

  try {
    const accounts = await adapter.query(
      "SELECT * FROM dns_accounts WHERE type = 'cloudflare'"
    ) as unknown as DnsAccount[];

    const allTunnels: any[] = [];
    for (const acc of accounts) {
      const cfg = JSON.parse(acc.config);
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
  const adapter = getAdapter();
  if (!adapter) {
    res.status(500).json({ code: 500, msg: 'Database error' });
    return;
  }
  try {
    const acc = await getCloudflareAccountByTunnelId(adapter, req.params.accountId);
    if (!acc) return res.status(404).json({ code: 404, msg: 'Account not found' });
    
    const cfg = JSON.parse(acc.config);
    const cf = new CloudflareAdapter(cfg);
    const config = await cf.getTunnelConfig(req.params.accountId, req.params.tunnelId);
    res.json({ code: 0, data: config, msg: 'success' });
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

router.put('/:accountId/:tunnelId/config', authMiddleware, async (req: Request, res: Response) => {
  const adapter = getAdapter();
  if (!adapter) return res.status(500).json({ code: 500, msg: 'Database error' });
  try {
    const acc = await getCloudflareAccountByTunnelId(adapter, req.params.accountId);
    if (!acc) return res.status(404).json({ code: 404, msg: 'Account not found' });
    
    const cfg = JSON.parse(acc.config);
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
  const adapter = getAdapter();
  if (!adapter) return res.status(500).json({ code: 500, msg: 'Database error' });
  try {
    const acc = await getCloudflareAccountByTunnelId(adapter, req.params.accountId);
    if (!acc) return res.status(404).json({ code: 404, msg: 'Account not found' });
    
    const cfg = JSON.parse(acc.config);
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
