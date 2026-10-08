import dl from '../../providers/dataLayer.js';
import { Watchlist } from '../../models/watchlist.model.js';
import { createWatchlistStore } from '../../services/watchlistStore.js';

function num(v) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Number(v);
}

// Flattens a DexScreener pair into the stat fields the watchlist page shows.
function mapPair(pair) {
  if (!pair) return null;
  return {
    symbol: (pair.baseToken && pair.baseToken.symbol) || undefined,
    name: (pair.baseToken && pair.baseToken.name) || undefined,
    imageUrl: (pair.info && pair.info.imageUrl) || undefined,
    priceUsd: num(pair.priceUsd),
    marketCapUsd: num(pair.marketCap != null ? pair.marketCap : pair.fdv),
    liquidityUsd: num(pair.liquidity && pair.liquidity.usd),
    volume24h: num(pair.volume && pair.volume.h24),
    volume1h: num(pair.volume && pair.volume.h1),
    priceChange24h: num(pair.priceChange && pair.priceChange.h24),
    priceChange1h: num(pair.priceChange && pair.priceChange.h1),
    dexId: pair.dexId || undefined,
    pairAddress: pair.pairAddress || undefined,
    url: pair.url || undefined,
  };
}

export function createWatchlistController({ store, dexBatch = (mints, opts) => dl.dexBatch(mints, opts) }) {
  async function getWatchlistController(req, res, next) {
    try {
      const items = await store.list(req.user.userId);
      if (!items.length) return res.json({ items: [] });

      // One DexScreener batch refreshes every saved token; on any upstream
      // failure the stored snapshot still serves the page.
      const result = await dexBatch(items.map((i) => i.mint), { feed: 'watchlist' });
      const livePairs = result && !result.error ? result : {};

      return res.json({
        items: items.map((item) => {
          const pair = livePairs[item.mint] && livePairs[item.mint][0];
          const stats = mapPair(pair);
          // Drop undefined so a sparse pair never blanks the stored snapshot.
          const liveFields = stats
            ? Object.fromEntries(Object.entries(stats).filter(([, v]) => v !== undefined))
            : {};
          return { ...item, ...liveFields, live: Boolean(pair) };
        }),
      });
    } catch (err) {
      return next(err);
    }
  }

  async function addWatchlistController(req, res, next) {
    try {
      const mint = req.params.mint || (req.body && req.body.mint);
      if (!mint || mint.length < 32) {
        return res.status(400).json({ error: 'Invalid mint address' });
      }

      const body = req.body || {};
      const outcome = await store.add(req.user.userId, {
        mint,
        symbol: typeof body.symbol === 'string' ? body.symbol : '',
        name: typeof body.name === 'string' ? body.name : '',
        imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : '',
        priceUsd: num(body.priceUsd),
        marketCapUsd: num(body.marketCapUsd),
        priceChange24h: num(body.priceChange24h),
        volume24h: num(body.volume24h),
      });

      if (outcome.error) return res.status(outcome.status || 400).json({ error: outcome.error });
      return res.json({ added: outcome.added, item: outcome.item });
    } catch (err) {
      return next(err);
    }
  }

  async function removeWatchlistController(req, res, next) {
    try {
      const { mint } = req.params;
      if (!mint || mint.length < 32) {
        return res.status(400).json({ error: 'Invalid mint address' });
      }
      const outcome = await store.remove(req.user.userId, mint);
      return res.json(outcome);
    } catch (err) {
      return next(err);
    }
  }

  return { getWatchlistController, addWatchlistController, removeWatchlistController };
}

// Default instance wired to the real store; tests build their own with
// createWatchlistController({ store, dexBatch }).
const store = createWatchlistStore({ model: Watchlist });
export const {
  getWatchlistController,
  addWatchlistController,
  removeWatchlistController,
} = createWatchlistController({ store });
