import { Router } from 'express';
import { clientEventBatchSchema } from '@pet/shared';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as progress from '../controllers/progress.controller.js';
import * as events from '../controllers/events.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/summary', progress.getSummary);
router.get('/weaknesses', progress.getWeaknesses);
router.get('/history', progress.getHistory);
router.post('/events', validate(clientEventBatchSchema), events.ingest);

export default router;
