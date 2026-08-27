import pino from 'pino';
import { env, isProd, isTest } from './env.js';

/**
 * Redaction is not optional here: request bodies carry auth codes and learner
 * text, and headers carry bearer tokens.
 */
export const logger = pino({
  level: isTest ? 'silent' : isProd ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.code',
      'req.body.refreshToken',
      'password',
      '*.accessToken',
      '*.refreshToken',
      '*.apiKey',
    ],
    censor: '[redacted]',
  },
  transport: isProd || isTest ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
});

export { env };
