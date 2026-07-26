import { Router, Request, Response } from 'express';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { createLogger } from '../lib/logger';
import { parseInteger, sendSuccess } from '../utils/http';
import { collectSnapshot } from '../service/resource/collector';
import { pruneResourceHistoryJob } from '../service/resource/prune';
import { getResourceHistory } from '../db/bal/resource-metrics-operations';

const log = createLogger('HTTP').sub('Route').sub('ResourceMonitor');
const router = Router();

router.get('/current', authMiddleware, asyncHandler(async (_req: Request, res: Response) => {
  const snapshot = await collectSnapshot();
  sendSuccess(res, snapshot);
}));

router.get('/history', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const page = parseInteger(req.query.page) || 1;
  const pageSize = Math.min(parseInteger(req.query.pageSize) || 60, 1440);
  const hours = Math.min(parseInteger(req.query.hours) || 24, 72);

  const result = await getResourceHistory(page, pageSize, hours);
  sendSuccess(res, result);
}));

router.post('/prune', authMiddleware, adminOnly, asyncHandler(async (_req: Request, res: Response) => {
  const deleted = await pruneResourceHistoryJob();
  log.info('Resource history pruned manually', { deleted });
  sendSuccess(res, { deleted });
}));

export default router;
