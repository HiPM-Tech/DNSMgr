import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { normalizeRole } from '../utils/roles';
import { sendError, sendSuccess } from '../utils/http';
import { log } from '../lib/logger';
import { DnsAccountOperations, RenewableDomainOperations } from '../db/business-adapter';
import { listSubdomains as dnsheListSubdomains } from '../lib/dns/providers/dnshe/renewal';

const router = Router();

/**
 * Get renewable domains from a specific provider
 * GET /api/providers/:type/renewable-domains
 */
router.get('/:type/renewable-domains', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // Only allow admins and super admins
  const role = normalizeRole(req.user?.role);
  if (role < 2) {
    sendError(res, 'Permission denied');
    return;
  }

  const { type } = req.params;
  
  try {
    // Get all accounts of the specified provider type
    const accounts = await DnsAccountOperations.getAll() as any[];
    const providerAccounts = accounts.filter((acc: any) => acc.type === type);
    
    if (providerAccounts.length === 0) {
      sendSuccess(res, []);
      return;
    }

    // Get already added renewable domains to filter them out
    const existingRenewableDomains = await RenewableDomainOperations.getAllEnabled();
    const existingThirdIds = new Set(
      existingRenewableDomains
        .filter((d: any) => providerAccounts.some((acc: any) => acc.id === d.account_id))
        .map((d: any) => String(d.third_id))
    );

    let allDomains: any[] = [];

    // Call provider-specific function based on type
    switch (type) {
      case 'dnshe': {
        // Fetch domains from each DNSHE account
        for (const account of providerAccounts) {
          try {
            const config = typeof account.config === 'string' ? JSON.parse(account.config) : account.config;
            
            const result = await dnsheListSubdomains({
              apiKey: config.apiKey,
              apiSecret: config.apiSecret,
              useProxy: !!config.useProxy,
            });
            
            if (result && result.success && result.subdomains) {
              // Filter out already added domains and add account info
              const domainsWithAccount = result.subdomains
                .filter((sub: any) => !existingThirdIds.has(String(sub.id)))  // Exclude already added
                .map((sub: any) => ({
                  ...sub,
                  account_id: account.id,
                  account_name: account.name,
                  name: sub.full_domain,  // Use full_domain from DNSHE API directly
                  id: sub.id,
                  third_id: String(sub.id),
                }));
              
              allDomains.push(...domainsWithAccount);
            }
          } catch (error) {
            log.error('Providers', `Failed to fetch domains from ${type} account`, {
              accountId: account.id,
              accountName: account.name,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        break;
      }
      
      // TODO: Add other providers here when they support renewal
      // case 'other_provider': {
      //   // Call other provider's listRenewableDomains function
      //   break;
      // }
      
      default:
        sendError(res, `Provider type '${type}' does not support domain renewal`);
        return;
    }

    sendSuccess(res, allDomains);
  } catch (error) {
    log.error('Providers', `Failed to fetch renewable domains for ${type}`, { error });
    sendError(res, error instanceof Error ? error.message : 'Failed to fetch domains');
  }
}));

export default router;
