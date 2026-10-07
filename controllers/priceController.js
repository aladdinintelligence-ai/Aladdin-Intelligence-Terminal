import { createSolPrice } from '../providers/solPrice.js';

const solPrice = createSolPrice();

export async function getPriceController(_req, res) {
  try {
    const result = await solPrice.get();
    if (result.data.price == null) {
      return res.status(503).json({
        error: 'SOL price unavailable',
        data: result.data,
        meta: result.meta,
      });
    }
    return res.json(result);
  } catch (err) {
    console.error(`[PRICE] handler failure: ${err.message}`);
    return res.status(503).json({
      error: 'SOL price unavailable',
      data: { price: null },
      meta: { source: 'coingecko', fetchedAt: null, fresh: false },
    });
  }
}