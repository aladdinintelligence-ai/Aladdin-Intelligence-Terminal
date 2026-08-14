import { Router } from 'express';
import { tokensController, internalController, healthController } from '../controllers/index.js';

const router = Router();

router.get('/health', healthController.healthController);

router.post('/api/tokens/:mint/sync', tokensController.syncTokenController);
router.get('/api/tokens/:mint', tokensController.getTokenController);
router.get('/api/tokens/:mint/trades', tokensController.getTradesController);
router.get('/api/tokens/:mint/participants', tokensController.getParticipantsController);
router.get('/api/tokens/:mint/first-buyers', tokensController.getFirstBuyersController);
router.get('/api/tokens/:mint/holders', tokensController.getHoldersController);
router.get('/api/tokens/:mint/profitable-wallets', tokensController.getProfitableWalletsController);
router.get('/api/wallets/:wallet/tokens/:mint', tokensController.getWalletTokenController);

router.get('/api/internal/wallets/:wallet/behaviour-evaluation', internalController.behaviourEvaluationController);
router.get('/api/internal/tokens/:mint/wallets/:wallet/identity', internalController.identityDebugController);

export default router;
