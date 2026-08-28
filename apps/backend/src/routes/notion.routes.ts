import { Router } from 'express';
import { notionSyncRequestSchema } from '@pet/shared';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as notion from '../controllers/notion.controller.js';

const router = Router();

// The callback is the one route Notion itself calls, in a normal browser tab,
// so it cannot carry our bearer token. The signed `state` is what identifies
// the learner there.
router.get('/callback', notion.callback);

router.use(requireAuth);
router.get('/status', notion.getStatus);
router.get('/connect', notion.getConnect);
router.post('/sync', validate(notionSyncRequestSchema), notion.postSync);
router.post('/disconnect', notion.postDisconnect);

export default router;
