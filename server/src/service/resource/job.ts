import { createLogger } from '../../lib/logger';
import { wsService } from '../websocket';
import { collectSnapshot } from './collector';
import { clearProbes } from './cache';
import {
  insertResourceHistory,
  upsertResourceMetrics,
} from '../../db/bal/resource-metrics-operations';

const log = createLogger('RESOURCE').sub('Job');

let collectInterval: NodeJS.Timeout | null = null;
let flushInterval: NodeJS.Timeout | null = null;

export function startResourceMonitorJob(): void {
  if (collectInterval) return;
  log.info('Starting resource monitor job (collect every 10s, flush every 60s)');

  collectInterval = setInterval(() => {
    try {
      const snapshot = collectSnapshot();
      wsService.broadcast({ type: 'resource:snapshot', data: snapshot });
    } catch (err) {
      log.error('Resource collect error', { error: err });
    }
  }, 10000);

  flushInterval = setInterval(async () => {
    try {
      await flushSnapshot();
      clearProbes();
    } catch (err) {
      log.error('Resource flush error', { error: err });
    }
  }, 60000);
}

async function flushSnapshot(): Promise<void> {
  const snapshot = collectSnapshot();
  try {
    await Promise.all([
      upsertResourceMetrics(snapshot),
      insertResourceHistory(snapshot),
    ]);
  } catch (err) {
    log.error('Failed to flush resource snapshot', { error: err });
  }
}

export function stopResourceMonitorJob(): void {
  if (collectInterval) {
    clearInterval(collectInterval);
    collectInterval = null;
  }
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
  log.info('Resource monitor job stopped');
}
