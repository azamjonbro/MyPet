import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { env, devAuthEnabled } from './config/env.js';
import { logger } from './config/logger.js';
import { startRollupJob } from './jobs/rollup.job.js';

async function main(): Promise<void> {
  await connectDb();

  const stopRollup = startRollupJob();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, devAuth: devAuthEnabled },
      `API listening on http://localhost:${env.PORT}/api/v1`,
    );
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    stopRollup();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
