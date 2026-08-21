import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getQuoteController,
  swapController,
  getBalanceController,
  getTradeHistoryController,
  getPriceController,
} from '../controllers/swap/swapController.js';

const router = Router();

router.post('/api/swap/quote', requireAuth, getQuoteController);
router.post('/api/swap', requireAuth, swapController);
router.get('/api/swap/balance', requireAuth, getBalanceController);
router.get('/api/swap/history', requireAuth, getTradeHistoryController);
router.get('/api/swap/price/:mint', requireAuth, getPriceController);

export default router;
