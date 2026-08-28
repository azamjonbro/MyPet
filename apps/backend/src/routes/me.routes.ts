import { Router } from 'express';
import { onboardingRequestSchema, updateProfileSchema, updateSettingsSchema } from '@pet/shared';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as me from '../controllers/me.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/', me.me);
router.patch('/profile', validate(updateProfileSchema), me.patchProfile);
router.patch('/settings', validate(updateSettingsSchema), me.patchSettings);
router.post('/onboarding', validate(onboardingRequestSchema), me.postOnboarding);

export default router;
