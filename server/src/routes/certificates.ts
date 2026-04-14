import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { CertificateOperations, DomainOperations, DnsAccountOperations } from '../db/business-adapter';
import { issueCertificate } from '../service/acme';
import { parseInteger, getString, sendSuccess, sendError } from '../utils/http';
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
router.get('/domains', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const domains = await DomainOperations.getUserAccessibleDomains(req.user!.userId);
  sendSuccess(res, domains);
}));

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
router.get('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const certs = await CertificateOperations.getByUserId(req.user!.userId);
  const list = certs.map(formatCertificate);
  sendSuccess(res, list);
}));

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
router.get('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const certId = parseInteger(req.params.id) ?? 0;
  if (!certId) {
    sendError(res, 'Invalid certificate ID', 400);
    return;
  }

  const cert = await CertificateOperations.getById(certId);
  if (!cert || cert.created_by !== req.user!.userId) {
    sendError(res, 'Certificate not found', 404);
    return;
  }

  sendSuccess(res, formatCertificate(cert));
}));

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
router.post('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { domain, domain_id, auto_renew } = req.body;

  if (!domain || !domain_id) {
    sendError(res, 'Missing required fields: domain, domain_id', 400);
    return;
  }

  // Get domain info
  const domainRecord = await DomainOperations.getById(domain_id);
  if (!domainRecord) {
    sendError(res, 'Domain not found', 404);
    return;
  }

  const accountId = domainRecord.account_id as number;

  // Get DNS account
  const account = await DnsAccountOperations.getById(accountId);
  if (!account) {
    sendError(res, 'DNS account not found', 404);
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

  sendSuccess(res, { id: certId }, 'Certificate issuance started');
}));

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
router.delete('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const certId = parseInteger(req.params.id) ?? 0;
  if (!certId) {
    sendError(res, 'Invalid certificate ID', 400);
    return;
  }

  const cert = await CertificateOperations.getById(certId);
  if (!cert || cert.created_by !== req.user!.userId) {
    sendError(res, 'Certificate not found', 404);
    return;
  }

  await CertificateOperations.delete(certId);
  sendSuccess(res, undefined, 'Certificate deleted');
}));

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
router.post('/:id/renew', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const certId = parseInteger(req.params.id) ?? 0;
  if (!certId) {
    sendError(res, 'Invalid certificate ID', 400);
    return;
  }

  const cert = await CertificateOperations.getById(certId);
  if (!cert || cert.created_by !== req.user!.userId) {
    sendError(res, 'Certificate not found', 404);
    return;
  }

  const domainRecord = await DomainOperations.getById(cert.domain_id as number);
  if (!domainRecord) {
    sendError(res, 'Domain not found', 404);
    return;
  }

  const account = await DnsAccountOperations.getById(cert.account_id as number);
  if (!account) {
    sendError(res, 'DNS account not found', 404);
    return;
  }

  await CertificateOperations.update(certId, { status: 'issuing', last_error: null });

  // Issue certificate asynchronously
  issueAsync(certId, cert.domain as string, domainRecord, account);

  sendSuccess(res, undefined, 'Certificate renewal started');
}));

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
router.patch('/:id/auto-renew', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const certId = parseInteger(req.params.id) ?? 0;
  const { auto_renew } = req.body;

  if (!certId || typeof auto_renew !== 'boolean') {
    sendError(res, 'Invalid parameters', 400);
    return;
  }

  const cert = await CertificateOperations.getById(certId);
  if (!cert || cert.created_by !== req.user!.userId) {
    sendError(res, 'Certificate not found', 404);
    return;
  }

  await CertificateOperations.update(certId, { auto_renew: auto_renew ? 1 : 0 });
  sendSuccess(res, undefined, 'Auto-renewal updated');
}));

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
router.get('/:id/download', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const certId = parseInteger(req.params.id) ?? 0;
  const fileType = getString(req.query.type) || 'certificate';

  if (!certId) {
    sendError(res, 'Invalid certificate ID', 400);
    return;
  }

  const cert = await CertificateOperations.getById(certId);
  if (!cert || cert.created_by !== req.user!.userId) {
    sendError(res, 'Certificate not found', 404);
    return;
  }

  if (cert.status !== 'valid') {
    sendError(res, 'Certificate is not valid', 400);
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
    sendError(res, 'File not available', 404);
    return;
  }

  sendSuccess(res, { content, filename });
}));

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
