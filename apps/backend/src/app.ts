import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env, isTest } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());

  // The extension's origin is chrome-extension://<id>, which varies per build.
  // No cookies are used, so there is no CSRF surface to protect here.
  const allowed = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true);
        if (origin.startsWith('chrome-extension://')) return cb(null, true);
        if (allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
        cb(null, false);
      },
      credentials: false,
    }),
  );

  app.use(express.json({ limit: '128kb' }));

  if (!isTest) {
    app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
  }

  app.use('/api/v1', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
