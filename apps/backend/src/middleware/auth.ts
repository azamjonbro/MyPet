import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors.js';
import { verifyAccessToken } from '../services/token.service.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    next(AppError.unauthenticated());
    return;
  }
  try {
    const payload = verifyAccessToken(header.slice(7).trim());
    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
  } catch (err) {
    next(err);
  }
}

/** Narrows the optional field for controllers that sit behind requireAuth. */
export function userIdOf(req: Request): string {
  if (!req.userId) throw AppError.unauthenticated();
  return req.userId;
}
