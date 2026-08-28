import { Router } from 'express';
import authRoutes from './auth.routes.js';
import meRoutes from './me.routes.js';
import chatRoutes from './chat.routes.js';
import progressRoutes from './progress.routes.js';
import missionRoutes from './missions.routes.js';
import notionRoutes from './notion.routes.js';
import { devAuthEnabled } from '../config/env.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, devAuth: devAuthEnabled, ts: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/me', meRoutes);
router.use('/chat', chatRoutes);
router.use('/progress', progressRoutes);
router.use('/missions', missionRoutes);
router.use('/notion', notionRoutes);

export default router;
