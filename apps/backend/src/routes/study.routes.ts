import { Router } from 'express';
import { createReminderSchema, startStudySchema } from '@pet/shared';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as study from '../controllers/study.controller.js';
import * as reminders from '../controllers/reminder.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/session', study.getActive);
router.post('/session', validate(startStudySchema), study.postStart);
router.post('/session/end', study.postEnd);

router.get('/reminders', reminders.getReminders);
router.post('/reminders', validate(createReminderSchema), reminders.postReminder);
router.post('/reminders/:id/delivered', reminders.postDelivered);
router.delete('/reminders/:id', reminders.deleteReminder);

export default router;
