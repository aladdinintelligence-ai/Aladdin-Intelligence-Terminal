import { Router } from 'express';
import { tokensController, internalController, healthController, launchesController, moversController, ogController, smartMoneyController, formationController, insiderController, clusterController, historicalController, watchlistController, alertsController, searchController } from '../controllers/index.js';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.js';
import swapRouter from './swap.js';
import askRouter from './ask.js';
import { getTokenInfoController } from '../controllers/token/tokenInfoController.js';
import { getTokenChartController } from '../controllers/token/tokenChartController.js';
import { getTokenDetailController } from '../controllers/token/tokenDetailController.js';
import { getPriceController } from '../controllers/priceController.js';
import { getBudgetController, resetBudgetController } from '../controllers/budget/budgetController.js';

const router = Router();

router.get('/health', healthController.healthController);

router.use(swapRouter);
router.use(askRouter);

router.get('/api/token-info/:mint', getTokenInfoController);
router.get('/api/token-chart/:mint', getTokenChartController);
// optionalAuth: the route stays public, but a signed-in caller gets req.user
// so the cold-build limiter can apply its per-user window.
router.get('/api/token-detail/:mint', optionalAuth, getTokenDetailController);
router.get('/api/launches', launchesController.getLaunchesController);
router.get('/api/search', searchController.getSearchController);
router.get('/api/movers', moversController.getMoversController);
router.get('/api/og', ogController.getOgController);
router.get('/api/smart-money', smartMoneyController.getSmartMoneyController);
router.get('/api/formation', formationController.getFormationController);
router.get('/api/insiders', insiderController.getInsiderController);
router.get('/api/clusters', clusterController.getClusterController);
router.get('/api/historical', historicalController.getHistoricalController);
router.get('/api/alerts', alertsController.getAlertsController);
router.get('/api/price/sol', getPriceController);

// Watchlist: per-user saved tokens (auth = cookie/Bearer, same as ask).
router.get('/api/watchlist', requireAuth, watchlistController.getWatchlistController);
router.post('/api/watchlist/:mint', requireAuth, watchlistController.addWatchlistController);
router.delete('/api/watchlist/:mint', requireAuth, watchlistController.removeWatchlistController);

router.post('/api/tokens/:mint/sync', requireAuth, tokensController.syncTokenController);
router.get('/api/tokens/:mint', requireAuth, tokensController.getTokenController);
router.get('/api/tokens/:mint/trades', requireAuth, tokensController.getTradesController);
router.get('/api/tokens/:mint/participants', requireAuth, tokensController.getParticipantsController);
router.get('/api/tokens/:mint/first-buyers', requireAuth, tokensController.getFirstBuyersController);
router.get('/api/tokens/:mint/holders', requireAuth, tokensController.getHoldersController);
router.get('/api/tokens/:mint/profitable-wallets', requireAuth, tokensController.getProfitableWalletsController);
router.get('/api/wallets/:wallet/tokens/:mint', requireAuth, tokensController.getWalletTokenController);

router.get('/api/internal/wallets/:wallet/behaviour-evaluation', requireAuth, internalController.behaviourEvaluationController);
router.get('/api/internal/tokens/:mint/wallets/:wallet/identity', requireAuth, internalController.identityDebugController);
router.get('/api/internal/budget', requireAuth, requireAdmin, getBudgetController);
router.post('/api/internal/budget/reset', requireAuth, requireAdmin, resetBudgetController);

export default router;
