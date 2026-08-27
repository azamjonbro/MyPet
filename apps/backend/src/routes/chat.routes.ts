import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { chatMessageRequestSchema } from '@pet/shared';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as chat from '../controllers/chat.controller.js';
import { isTest } from '../config/env.js';

const router = Router();
router.use(requireAuth);

// Per-user, not per-IP: the daily token budget is the cost ceiling, this is
// the burst ceiling. Both are needed.
const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? req.ip ?? 'anonymous',
  message: { error: { code: 'RATE_LIMITED', message: 'Slow down a little — Mochi is still thinking.' } },
});

router.post('/message', ...(isTest ? [] : [chatLimiter]), validate(chatMessageRequestSchema), chat.message);
router.get('/sessions/:id', chat.session);

export default router;
