import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { normalizeRole } from '../utils/roles';
import { sendError, sendSuccess } from '../utils/http';
import { log } from '../lib/logger';
import { DnsAccountOperations, RenewableDomainOperations } from '../db/business-adapter';
import { listSubdomains as dnsheListSubdomains } from '../lib/dns/providers/dnshe/renewal';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

/**
 * Get provider icon
 * GET /api/providers/:type/icon
 */
router.get('/:type/icon', asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.params;
  
  try {
    // Icon file paths to check in priority order (SVG > PNG > ICO > JPG)
    // SVG is preferred for scalability and small file size
    const iconExtensions = ['.svg', '.png', '.ico', '.jpg', '.jpeg'];
    
    // Support both development (src) and production (dist) environments
    // In dev: __dirname = server/dist/routes, need to go up to server/src/lib/dns/providers
    // In prod: __dirname = server/dist/routes, need to go up to server/dist/lib/dns/providers
    const providersDir = path.join(__dirname, '..', 'lib', 'dns', 'providers');
    
    log.info('Providers', `Looking for icon in: ${providersDir}`);
    
    let iconPath = '';
    let iconExt = '';
    
    // Try to find icon file with highest priority extension first
    for (const ext of iconExtensions) {
      const candidatePath = path.join(providersDir, type, `icon${ext}`);
      log.info('Providers', `Checking: ${candidatePath} - ${fs.existsSync(candidatePath) ? 'FOUND' : 'NOT FOUND'}`);
      if (fs.existsSync(candidatePath)) {
        iconPath = candidatePath;
        iconExt = ext;
        log.info('Providers', `Serving icon for ${type}: icon${ext} (priority: ${iconExtensions.indexOf(ext) + 1}/${iconExtensions.length})`);
        break;
      }
    }
    
    // If not found in dist, try src directory (for development without copying files)
    if (!iconPath) {
      const srcProvidersDir = path.join(__dirname, '..', '..', 'src', 'lib', 'dns', 'providers');
      log.info('Providers', `Fallback: Looking in src directory: ${srcProvidersDir}`);
      for (const ext of iconExtensions) {
        const candidatePath = path.join(srcProvidersDir, type, `icon${ext}`);
        log.info('Providers', `Checking src: ${candidatePath} - ${fs.existsSync(candidatePath) ? 'FOUND' : 'NOT FOUND'}`);
        if (fs.existsSync(candidatePath)) {
          iconPath = candidatePath;
          iconExt = ext;
          log.info('Providers', `Serving icon from src for ${type}: icon${ext}`);
          break;
        }
      }
    }
    
    if (!iconPath || !fs.existsSync(iconPath)) {
      // Return 404 if icon not found
      log.warn('Providers', `Icon not found for provider: ${type}`);
      res.status(404).json({ error: 'Icon not found' });
      return;
    }
    
    // Set appropriate content type based on file extension
    const contentTypes: Record<string, string> = {
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
    };
    
    const contentType = contentTypes[iconExt] || 'application/octet-stream';
    
    // Read and send the icon file
    const iconData = fs.readFileSync(iconPath);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.send(iconData);
  } catch (error) {
    log.error('Providers', `Failed to serve icon for ${type}`, { error });
    res.status(500).json({ error: 'Failed to load icon' });
  }
}));

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
