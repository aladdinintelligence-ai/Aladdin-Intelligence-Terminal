import { createSolPrice } from '../providers/solPrice.js';
import { solPriceStore } from '../services/solPriceStore.js';

// Always answers 200 with a price:
//  - live CoinGecko value when available (and persists it to the DB backup),
//  - otherwise the DB backup (seeded at $100 on first read).
async function respondFromBackup(res, store, meta) {
  const backup = await store.readBackup();
  return res.json({
    data: { price: backup.price },
    meta: {
      source: 'db-backup',
      fetchedAt: backup.fetchedAt
        ? new Date(backup.fetchedAt).toISOString()
        : (meta && meta.fetchedAt) || null,
      fresh: false,
    },
  });
}

export function createPriceController({ solPrice = createSolPrice(), store = solPriceStore } = {}) {
  return async function getPriceController(_req, res) {
    try {
      const result = await solPrice.get();
      const live = result && result.data ? result.data.price : null;
      if (Number.isFinite(live)) {
        try {
          await store.writeBackup(live);
        } catch (writeErr) {
          console.error(`[PRICE] backup write failed: ${writeErr.message}`);
        }
        return res.json(result);
      }
      return await respondFromBackup(res, store, result && result.meta);
    } catch (err) {
      console.error(`[PRICE] handler failure: ${err.message}`);
      return respondFromBackup(res, store, null);
    }
  };
}

export const getPriceController = createPriceController();
