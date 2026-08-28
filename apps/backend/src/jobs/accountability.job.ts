import { runAccountabilitySweep } from '../services/accountability.service.js';
import { emailConfigured, isTest } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Every twenty minutes, because cut-off hours are per learner and spread
 * across every timezone. The sweep is idempotent — the email log's unique
 * index means running it twice sends nothing twice — so a missed tick costs a
 * delay, never a duplicate.
 */
const INTERVAL_MS = 20 * 60_000;

export function startAccountabilityJob(): () => void {
  if (isTest || !emailConfigured) return () => {};

  const run = () => {
    void runAccountabilitySweep()
      .then((sent) => {
        if (sent > 0) logger.info({ sent }, 'accountability emails sent');
      })
      .catch((err: unknown) => logger.warn({ err }, 'accountability sweep failed'));
  };

  const timer = setInterval(run, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
