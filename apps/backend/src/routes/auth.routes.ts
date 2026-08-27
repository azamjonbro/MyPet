import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { devAuthRequestSchema, googleAuthRequestSchema, refreshRequestSchema } from '@pet/shared';
import { validate } from '../middleware/validate.js';
import * as auth from '../controllers/auth.controller.js';
import { devAuthEnabled } from '../config/env.js';

const router = Router();

// Auth endpoints are limited per IP: they are the only unauthenticated surface.
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again shortly.' } },
});

router.post('/google', authLimiter, validate(googleAuthRequestSchema), auth.google);
router.post('/refresh', authLimiter, validate(refreshRequestSchema), auth.refresh);
router.post('/logout', validate(refreshRequestSchema), auth.logout);

if (devAuthEnabled) {
  router.post('/dev', authLimiter, validate(devAuthRequestSchema), auth.dev);
}

export default router;
