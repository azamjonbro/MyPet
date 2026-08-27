import type { NextFunction, Request, Response } from 'express';
import type { UpdateProfileRequest } from '@pet/shared';
import { getMe, updateProfile } from '../services/profile.service.js';
import { userIdOf } from '../middleware/auth.js';

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await getMe(userIdOf(req)));
  } catch (err) {
    next(err);
  }
}

export async function patchProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await updateProfile(userIdOf(req), req.body as UpdateProfileRequest));
  } catch (err) {
    next(err);
  }
}
