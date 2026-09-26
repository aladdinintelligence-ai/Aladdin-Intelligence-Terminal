import { fetchTokenOHLC, provider as dataProvider } from '../../providers/index.js';

const cache = new Map();
const CACHE_TTL = 60_000;

export async function getTokenChartController(req, res, next) {
  try {
    const { mint } = req.params;
    if (!mint || mint.length < 32) {
      return res.status(400).json({ error: 'Invalid mint address' });
    }

    const interval = Math.min(Math.max(parseInt(req.query.interval) || 5, 1), 60);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 60, 10), 500);
    const cacheKey = `${mint}:${interval}:${limit}`;

    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return res.json(cached.data);
    }

    const result = await fetchTokenOHLC(mint, { intervalMinutes: interval, limit });

    if (result.error) {
      return res.status(502).json({ error: result.error });
    }

    const response = {
      data: result.candles,
      meta: {
        mint,
        interval,
        count: result.candles.length,
        source: dataProvider,
        fetchedAt: new Date().toISOString(),
      },
    };

    cache.set(cacheKey, { data: response, ts: Date.now() });
    return res.json(response);
  } catch (exc) {
    return next(exc);
  }
}
