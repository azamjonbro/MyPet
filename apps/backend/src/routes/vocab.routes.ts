import { Router } from 'express';
import { addWordsRequestSchema, updateWordSchema } from '@pet/shared';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as vocab from '../controllers/vocab.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', vocab.getWords);
router.post('/', validate(addWordsRequestSchema), vocab.postWords);
router.patch('/:id', validate(updateWordSchema), vocab.patchWord);
router.delete('/:id', vocab.deleteWord);

export default router;
