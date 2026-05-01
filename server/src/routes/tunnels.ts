import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { DnsAccountOperations, TeamOperations } from '../db/business-adapter';
import { CloudflareAdapter } from '../lib/dns/providers';
import { DnsAccount } from '../types';
import { isSuper, normalizeRole } from '../utils/roles';
import { wsService } from '../service/websocket';
import { log } from '../lib/logger';

const router = Router();

async function getAccessibleCloudflareAccounts(userId: number, role: number): Promise<DnsAccount[]> {
  if (isSuper(role)) {
    return await DnsAccountOperations.getByType('cloudflare') as unknown as DnsAccount[];
  }
  
  const teamIds = await TeamOperations.getTeamIdsByUserId(userId);
  
  if (teamIds.length > 0) {
    return await DnsAccountOperations.getByTypeAndUserOrTeams('cloudflare', userId, teamIds) as unknown as DnsAccount[];
  }
  
  return await DnsAccountOperations.getByTypeAndUser('cloudflare', userId) as unknown as DnsAccount[];
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
      // 推送 WebSocket 消息
      try {
        wsService.broadcast({
          type: 'tunnel_config_updated',
          data: {
            accountId: req.params.accountId,
            tunnelId: req.params.tunnelId,
          },
        });
      } catch (error) {
        log.error('Tunnels', 'Failed to broadcast tunnel_config_updated event', { error });
      }
      
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
      // 推送 WebSocket 消息
      try {
        wsService.broadcast({
          type: 'tunnel_deleted',
          data: {
            accountId: req.params.accountId,
            tunnelId: req.params.tunnelId,
          },
        });
      } catch (error) {
        log.error('Tunnels', 'Failed to broadcast tunnel_deleted event', { error });
      }
      
      res.json({ code: 0, msg: 'success' });
    } else {
      res.json({ code: -1, msg: 'Failed to delete tunnel' });
    }
  } catch (e) {
    res.json({ code: -1, msg: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
