import { createLogger } from '../../lib/logger';
import { pruneResourceHistory } from '../../db/bal/resource-metrics-operations';

const log = createLogger('RESOURCE').sub('Prune');

export async function pruneResourceHistoryJob(): Promise<number> {
  try {
    const changes = await pruneResourceHistory(72);
    if (changes > 0) {
      log.info(`Pruned ${changes} old resource metric rows`);
    }
    return changes;
  } catch (err) {
    log.error('Failed to prune resource history', { error: err });
    return 0;
  }
}

export function startResourcePruneJob(): void {
  setInterval(async () => {
    try {
      await pruneResourceHistoryJob();
    } catch (err) {
      log.error('Resource prune error', { error: err });
    }
  }, 24 * 60 * 60 * 1000);
}
