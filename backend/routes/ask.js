import { Router } from 'express';
import {
  askAladdinController,
  listSessionsController,
  saveSessionController,
  deleteSessionController,
  duplicateSessionController,
  getActiveSessionController,
  getProfileController,
  patchProfileController,
  getAnalysisRunController,
} from '../controllers/ask/askAladdinController.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { applyProfile } from '../middleware/personalization.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';

const askRouter = Router();

const askLimiter = createRateLimiter({ windowMs: 60_000, max: 20, keyPrefix: 'ask' });

// optionalAuth (not requireAuth): Ask Aladdin is usable without an account.
// Signed-in callers get req.user/req.profile; anonymous callers are rate-limited
// per IP and their runs are never persisted.
askRouter.post('/api/ask', optionalAuth, applyProfile, askLimiter, askAladdinController);

askRouter.get('/api/ask/sessions', requireAuth, applyProfile, listSessionsController);
askRouter.post('/api/ask/sessions', requireAuth, applyProfile, saveSessionController);
askRouter.delete('/api/ask/sessions/:id', requireAuth, applyProfile, deleteSessionController);
askRouter.post('/api/ask/sessions/:id/duplicate', requireAuth, applyProfile, duplicateSessionController);
askRouter.get('/api/ask/sessions/active', requireAuth, applyProfile, getActiveSessionController);
askRouter.get('/api/ask/sessions/:id/active', requireAuth, applyProfile, getActiveSessionController);
askRouter.get('/api/ask/sessions/:id/runs/latest', requireAuth, applyProfile, getAnalysisRunController);
askRouter.get('/api/ask/profile', requireAuth, applyProfile, getProfileController);
askRouter.patch('/api/ask/profile', requireAuth, applyProfile, patchProfileController);

export default askRouter;