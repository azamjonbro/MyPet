import { Router } from 'express';
import { customTaskRequestSchema } from '@pet/shared';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as missions from '../controllers/mission.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/today', missions.getToday);
router.post('/today/tasks', validate(customTaskRequestSchema), missions.postCustomTask);
router.delete('/today/tasks/:taskId', missions.deleteCustomTask);
router.post('/today/tasks/:taskId/complete', missions.postComplete);
router.get('/history', missions.getHistory);

export default router;
