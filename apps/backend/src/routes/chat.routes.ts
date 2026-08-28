import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
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
  // Signed-in learners are limited per account. The IP fallback must go through
  // ipKeyGenerator, which normalises an IPv6 address to its /64 — otherwise a
  // client can hop addresses inside its own subnet and never hit the limit.
  keyGenerator: (req) => req.userId ?? ipKeyGenerator(req.ip ?? 'anonymous'),
  message: { error: { code: 'RATE_LIMITED', message: 'Slow down a little — Mocha is still thinking.' } },
});

router.post('/message', ...(isTest ? [] : [chatLimiter]), validate(chatMessageRequestSchema), chat.message);
router.get('/sessions/:id', chat.session);

export default router;
