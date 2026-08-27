import type { NextFunction, Request, Response } from 'express';
import type { DevAuthRequest, GoogleAuthRequest, RefreshRequest } from '@pet/shared';
import { signInDev, signInWithGoogle } from '../services/auth.service.js';
import { revokeFamilyFor, rotateRefreshToken } from '../services/token.service.js';
import { devAuthEnabled } from '../config/env.js';
import { AppError } from '../utils/errors.js';

/** Controllers stay thin: parse, call one service, shape the response. */
export async function google(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await signInWithGoogle(req.body as GoogleAuthRequest, req.header('user-agent')));
  } catch (err) {
    next(err);
  }
}

export async function dev(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!devAuthEnabled) throw AppError.forbidden('Development sign-in is disabled.');
    res.json(await signInDev(req.body as DevAuthRequest, req.header('user-agent')));
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body as RefreshRequest;
    res.json(await rotateRefreshToken(refreshToken, req.header('user-agent')));
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body as RefreshRequest;
    await revokeFamilyFor(refreshToken);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
