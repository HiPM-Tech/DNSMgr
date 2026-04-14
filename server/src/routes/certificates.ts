import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { CertificateOperations, DomainOperations, DnsAccountOperations } from '../db/business-adapter';
import { issueCertificate } from '../service/acme';
import { log } from '../lib/logger';

const router = Router();

/**
 * @swagger
 * /api/certificates/domains:
 *   get:
 *     summary: Get available domains for certificate application
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available domains
 */
router.get('/domains', authMiddleware, async (req: Request, res: Response) => {
  try {
    const domains = await DomainOperations.getUserAccessibleDomains(req.user!.userId);
    res.json({ code: 0, data: domains, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get domains' });
  }
});

/**
 * @swagger
 * /api/certificates:
 *   get:
 *     summary: Get all SSL certificates for current user
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of certificates
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const certs = await CertificateOperations.getByUserId(req.user!.userId);
    const list = certs.map(formatCertificate);
    res.json({ code: 0, data: list, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get certificates' });
  }
});

/**
 * @swagger
 * /api/certificates/{id}:
 *   get:
 *     summary: Get a specific SSL certificate
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Certificate details
 */
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const certId = parseInt(req.params.id);
  if (isNaN(certId)) {
    res.status(400).json({ code: 400, msg: 'Invalid certificate ID' });
    return;
  }

  try {
    const cert = await CertificateOperations.getById(certId);
    if (!cert || cert.created_by !== req.user!.userId) {
      res.status(404).json({ code: 404, msg: 'Certificate not found' });
      return;
    }

    res.json({ code: 0, data: formatCertificate(cert), msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get certificate' });
  }
});

/**
 * @swagger
 * /api/certificates:
 *   post:
 *     summary: Apply for a new SSL certificate
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - domain
 *               - domain_id
 *             properties:
 *               domain:
 *                 type: string
 *                 description: Domain name for the certificate (e.g. "example.com" or "*.example.com")
 *               domain_id:
 *                 type: number
 *                 description: ID of the domain in DNSMgr
 *               auto_renew:
 *                 type: boolean
 *                 description: Enable auto-renewal (default true)
 *     responses:
 *       200:
 *         description: Certificate applied successfully
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const { domain, domain_id, auto_renew } = req.body;

  if (!domain || !domain_id) {
    res.status(400).json({ code: 400, msg: 'Missing required fields: domain, domain_id' });
    return;
  }

  try {
    // Get domain info
    const domainRecord = await DomainOperations.getById(domain_id);
    if (!domainRecord) {
      res.status(404).json({ code: 404, msg: 'Domain not found' });
      return;
    }

    const accountId = domainRecord.account_id as number;

    // Get DNS account
    const account = await DnsAccountOperations.getById(accountId);
    if (!account) {
      res.status(404).json({ code: 404, msg: 'DNS account not found' });
      return;
    }

    // Create certificate record
    const certId = await CertificateOperations.create({
      domain,
      domain_id,
      account_id: accountId,
      status: 'issuing',
      auto_renew: auto_renew === false ? 0 : 1,
      created_by: req.user!.userId,
    });

    // Issue certificate asynchronously
    issueAsync(certId, domain, domainRecord, account);

    res.json({ code: 0, data: { id: certId }, msg: 'Certificate issuance started' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to apply for certificate' });
  }
});

/**
 * @swagger
 * /api/certificates/{id}:
 *   delete:
 *     summary: Delete a certificate
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Certificate deleted
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const certId = parseInt(req.params.id);
  if (isNaN(certId)) {
    res.status(400).json({ code: 400, msg: 'Invalid certificate ID' });
    return;
  }

  try {
    const cert = await CertificateOperations.getById(certId);
    if (!cert || cert.created_by !== req.user!.userId) {
      res.status(404).json({ code: 404, msg: 'Certificate not found' });
      return;
    }

    await CertificateOperations.delete(certId);
    res.json({ code: 0, msg: 'Certificate deleted' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to delete certificate' });
  }
});

/**
 * @swagger
 * /api/certificates/{id}/renew:
 *   post:
 *     summary: Manually renew a certificate
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Renewal started
 */
router.post('/:id/renew', authMiddleware, async (req: Request, res: Response) => {
  const certId = parseInt(req.params.id);
  if (isNaN(certId)) {
    res.status(400).json({ code: 400, msg: 'Invalid certificate ID' });
    return;
  }

  try {
    const cert = await CertificateOperations.getById(certId);
    if (!cert || cert.created_by !== req.user!.userId) {
      res.status(404).json({ code: 404, msg: 'Certificate not found' });
      return;
    }

    const domainRecord = await DomainOperations.getById(cert.domain_id as number);
    if (!domainRecord) {
      res.status(404).json({ code: 404, msg: 'Domain not found' });
      return;
    }

    const account = await DnsAccountOperations.getById(cert.account_id as number);
    if (!account) {
      res.status(404).json({ code: 404, msg: 'DNS account not found' });
      return;
    }

    await CertificateOperations.update(certId, { status: 'issuing', last_error: null });

    // Issue certificate asynchronously
    issueAsync(certId, cert.domain as string, domainRecord, account);

    res.json({ code: 0, msg: 'Certificate renewal started' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to renew certificate' });
  }
});

/**
 * @swagger
 * /api/certificates/{id}/auto-renew:
 *   patch:
 *     summary: Toggle auto-renewal for a certificate
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - auto_renew
 *             properties:
 *               auto_renew:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Auto-renewal updated
 */
router.patch('/:id/auto-renew', authMiddleware, async (req: Request, res: Response) => {
  const certId = parseInt(req.params.id);
  const { auto_renew } = req.body;

  if (isNaN(certId) || typeof auto_renew !== 'boolean') {
    res.status(400).json({ code: 400, msg: 'Invalid parameters' });
    return;
  }

  try {
    const cert = await CertificateOperations.getById(certId);
    if (!cert || cert.created_by !== req.user!.userId) {
      res.status(404).json({ code: 404, msg: 'Certificate not found' });
      return;
    }

    await CertificateOperations.update(certId, { auto_renew: auto_renew ? 1 : 0 });
    res.json({ code: 0, msg: 'Auto-renewal updated' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to update auto-renewal' });
  }
});

/**
 * @swagger
 * /api/certificates/{id}/download:
 *   get:
 *     summary: Download certificate files
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [certificate, private_key, ca_certificate, fullchain]
 *     responses:
 *       200:
 *         description: Certificate file content
 */
router.get('/:id/download', authMiddleware, async (req: Request, res: Response) => {
  const certId = parseInt(req.params.id);
  const fileType = req.query.type as string || 'certificate';

  if (isNaN(certId)) {
    res.status(400).json({ code: 400, msg: 'Invalid certificate ID' });
    return;
  }

  try {
    const cert = await CertificateOperations.getById(certId);
    if (!cert || cert.created_by !== req.user!.userId) {
      res.status(404).json({ code: 404, msg: 'Certificate not found' });
      return;
    }

    if (cert.status !== 'valid') {
      res.status(400).json({ code: 400, msg: 'Certificate is not valid' });
      return;
    }

    let content: string;
    let filename: string;
    const domain = (cert.domain as string).replace('*.', 'wildcard.');

    switch (fileType) {
      case 'private_key':
        content = cert.private_key as string;
        filename = `${domain}.key`;
        break;
      case 'ca_certificate':
        content = cert.ca_certificate as string;
        filename = `${domain}.ca.pem`;
        break;
      case 'fullchain':
        content = `${cert.certificate}\n${cert.ca_certificate}`;
        filename = `${domain}.fullchain.pem`;
        break;
      case 'certificate':
      default:
        content = cert.certificate as string;
        filename = `${domain}.pem`;
        break;
    }

    if (!content) {
      res.status(404).json({ code: 404, msg: 'File not available' });
      return;
    }

    res.json({ code: 0, data: { content, filename }, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to download certificate' });
  }
});

// Helper: Format certificate for API response (exclude sensitive data from list view)
function formatCertificate(cert: Record<string, unknown>) {
  return {
    id: cert.id,
    domain: cert.domain,
    domain_id: cert.domain_id,
    account_id: cert.account_id,
    status: cert.status,
    issuer: cert.issuer,
    not_before: cert.not_before,
    not_after: cert.not_after,
    auto_renew: cert.auto_renew === 1 || cert.auto_renew === true,
    last_error: cert.last_error,
    created_at: cert.created_at,
    updated_at: cert.updated_at,
  };
}

// Helper: Issue certificate asynchronously
function issueAsync(
  certId: number,
  domain: string,
  domainRecord: Record<string, unknown>,
  account: Record<string, unknown>
) {
  const config = typeof account.config === 'string' ? JSON.parse(account.config as string) : account.config;

  issueCertificate(
    domain,
    {
      type: account.type as string,
      config: config as Record<string, string>,
      domain: domainRecord.name as string,
      zoneId: (domainRecord.third_id as string) || '',
    },
  ).then(async (result) => {
    await CertificateOperations.update(certId, {
      status: 'valid',
      private_key: result.privateKey,
      certificate: result.certificate,
      ca_certificate: result.caCertificate,
      csr: result.csr,
      issuer: result.issuer,
      not_before: result.notBefore,
      not_after: result.notAfter,
      acme_account_url: result.acmeAccountUrl,
      acme_account_key: result.acmeAccountKey,
      last_error: null,
    });
    log.info('Certificates', `Certificate issued successfully for ${domain}`);
  }).catch(async (err) => {
    log.error('Certificates', `Certificate issuance failed for ${domain}`, { error: err });
    await CertificateOperations.update(certId, {
      status: 'failed',
      last_error: err instanceof Error ? err.message : String(err),
    });
  });
}

export default router;
