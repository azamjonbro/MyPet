import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as missions from '../controllers/mission.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/today', missions.getToday);
router.post('/today/tasks/:taskId/complete', missions.postComplete);
router.get('/history', missions.getHistory);

export default router;
