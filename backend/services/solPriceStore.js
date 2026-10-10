import mongoose from 'mongoose';
import { SolPrice } from '../models/solPrice.model.js';

// DB backup for the SOL price route. Seeded at $100 until the first live
// price is stored; every successful /api/price/sol call writes the current
// price back here, and the route falls back to this doc whenever CoinGecko
// fails so the endpoint never has to return an error.
export const SOL_USD_BACKUP = 100;

export function createSolPriceStore({
  model = SolPrice,
  isConnected = () => mongoose.connection.readyState === 1,
} = {}) {
  // Returns { price, fetchedAt } and never throws. Falls back to the $100
  // seed when the doc is missing, the DB is down, or the query fails.
  async function readBackup() {
    const seeded = { price: SOL_USD_BACKUP, fetchedAt: null };
    if (!isConnected()) return seeded;
    try {
      const doc = await model.findById('sol-usd').lean();
      if (doc && Number.isFinite(doc.price)) {
        return { price: doc.price, fetchedAt: doc.updatedAt || null };
      }
      try {
        await model.updateOne(
          { _id: 'sol-usd' },
          { $setOnInsert: { price: SOL_USD_BACKUP } },
          { upsert: true },
        );
      } catch (seedErr) {
        console.error(`[PRICE] backup seed failed: ${seedErr.message}`);
      }
      return seeded;
    } catch (err) {
      console.error(`[PRICE] backup read failed: ${err.message}`);
      return seeded;
    }
  }

  // Best-effort write of the current price; never throws and never blocks
  // the route (a disconnected DB is skipped instead of buffering).
  async function writeBackup(price) {
    if (!Number.isFinite(price) || price <= 0) return;
    if (!isConnected()) return;
    try {
      await model.updateOne({ _id: 'sol-usd' }, { $set: { price } }, { upsert: true });
    } catch (err) {
      console.error(`[PRICE] backup write failed: ${err.message}`);
    }
  }

  return { readBackup, writeBackup };
}

export const solPriceStore = createSolPriceStore();
