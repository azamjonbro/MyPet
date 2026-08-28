import type { NextFunction, Request, Response } from 'express';
import type { OnboardingRequest, UpdateProfileRequest, UpdateSettingsRequest } from '@pet/shared';
import {
  completeOnboarding,
  getMe,
  updateProfile,
  updateSettings,
} from '../services/profile.service.js';
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

export async function postOnboarding(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await completeOnboarding(userIdOf(req), req.body as OnboardingRequest));
  } catch (err) {
    next(err);
  }
}

export async function patchSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await updateSettings(userIdOf(req), req.body as UpdateSettingsRequest));
  } catch (err) {
    next(err);
  }
}
