import type { NextFunction, Request, Response } from 'express';
import type { StartStudyRequest } from '@pet/shared';
import { activeSession, endSession, startSession } from '../services/study.service.js';
import { userIdOf } from '../middleware/auth.js';

export async function getActive(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ session: await activeSession(userIdOf(req)) });
  } catch (err) {
    next(err);
  }
}

export async function postStart(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as StartStudyRequest;
    res.status(201).json({ session: await startSession(userIdOf(req), body) });
  } catch (err) {
    next(err);
  }
}

export async function postEnd(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await endSession(userIdOf(req)));
  } catch (err) {
    next(err);
  }
}
