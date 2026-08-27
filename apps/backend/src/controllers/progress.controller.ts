import type { NextFunction, Request, Response } from 'express';
import { history, summary, weaknesses } from '../services/progress.service.js';
import { userIdOf } from '../middleware/auth.js';

export async function getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await summary(userIdOf(req)));
  } catch (err) {
    next(err);
  }
}

export async function getWeaknesses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ weaknesses: await weaknesses(userIdOf(req)) });
  } catch (err) {
    next(err);
  }
}

export async function getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = req.query.days;
    const days = Math.min(90, Math.max(7, Number.parseInt(String(raw ?? '30'), 10) || 30));
    res.json({ days: await history(userIdOf(req), days) });
  } catch (err) {
    next(err);
  }
}
