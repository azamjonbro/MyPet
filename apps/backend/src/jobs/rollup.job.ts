import { rollupPending } from '../services/analytics.service.js';
import { logger } from '../config/logger.js';
import { isTest } from '../config/env.js';

const INTERVAL_MS = 15 * 60_000;

/**
 * Folds raw events into daily stats on a timer.
 *
 * A real deployment should move this to a proper scheduler — with more than one
 * instance running, every instance would do the same work. The rollup is
 * idempotent so that is wasteful rather than wrong, which is the right failure
 * mode to have while it is still a timer.
 */
export function startRollupJob(): () => void {
  if (isTest) return () => {};

  const run = () => {
    void rollupPending()
      .then((count) => {
        if (count > 0) logger.debug({ count }, 'rolled up user-days');
      })
      .catch((err: unknown) => logger.warn({ err }, 'rollup failed'));
  };

  run();
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
