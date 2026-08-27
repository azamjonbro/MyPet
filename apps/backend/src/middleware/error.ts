import type { NextFunction, Request, Response } from 'express';
import { ERROR_CODES } from '@pet/shared';
import { AppError } from '../utils/errors.js';
import { logger } from '../config/logger.js';
import { isProd } from '../config/env.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: { code: ERROR_CODES.NOT_FOUND, message: 'No such endpoint.' },
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  logger.error({ err }, 'unhandled error');
  res.status(500).json({
    error: {
      code: ERROR_CODES.INTERNAL,
      message: 'Something went wrong on our side. Please try again.',
      ...(isProd ? {} : { details: err instanceof Error ? err.message : String(err) }),
    },
  });
}
