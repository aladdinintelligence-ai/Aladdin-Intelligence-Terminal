import { Router } from 'express';
import { tokensController, internalController, healthController, launchesController } from '../controllers/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/health', healthController.healthController);

router.get('/api/launches', launchesController.getLaunchesController);

router.post('/api/tokens/:mint/sync', requireAuth, tokensController.syncTokenController);
router.get('/api/tokens/:mint', requireAuth, tokensController.getTokenController);
router.get('/api/tokens/:mint/trades', requireAuth, tokensController.getTradesController);
router.get('/api/tokens/:mint/participants', requireAuth, tokensController.getParticipantsController);
router.get('/api/tokens/:mint/first-buyers', requireAuth, tokensController.getFirstBuyersController);
router.get('/api/tokens/:mint/holders', requireAuth, tokensController.getHoldersController);
router.get('/api/tokens/:mint/profitable-wallets', requireAuth, tokensController.getProfitableWalletsController);
router.get('/api/wallets/:wallet/tokens/:mint', requireAuth, tokensController.getWalletTokenController);

router.get('/api/internal/wallets/:wallet/behaviour-evaluation', internalController.behaviourEvaluationController);
router.get('/api/internal/tokens/:mint/wallets/:wallet/identity', internalController.identityDebugController);

export default router;
