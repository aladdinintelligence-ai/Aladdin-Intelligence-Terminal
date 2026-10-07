import { fetchTokenOHLC, provider as dataProvider } from '../../providers/index.js';
import dl from '../../providers/dataLayer.js';

export async function getTokenChartController(req, res, next) {
  try {
    const { mint } = req.params;
    if (!mint || mint.length < 32) {
      return res.status(400).json({ error: 'Invalid mint address' });
    }

    const interval = Math.min(Math.max(parseInt(req.query.interval) || 5, 1), 60);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 60, 10), 500);
    const cacheKey = `chart:${mint}:${interval}:${limit}`;

    const out = await dl.fetch({
      key: cacheKey,
      feed: 'chart',
      priority: 'user',
      request: async () => {
        const result = await fetchTokenOHLC(mint, { intervalMinutes: interval, limit, feed: 'chart', priority: 'user' });
        if (result.error) throw new Error(result.error);
        return {
          data: result.candles,
          meta: { mint, interval, count: result.candles.length, source: dataProvider },
        };
      },
    });

    if (out.unavailable) {
      return res.status(503).json({
        error: 'upstream_unavailable',
        message: 'Live market data is temporarily unavailable. Please try again in a few minutes.',
      });
    }

    const response = out.data;
    response.meta.fetchedAt = new Date(out.updatedAt).toISOString();
    if (out.stale) response.meta.stale = true;
    return res.json(response);
  } catch (exc) {
    console.error(`[chart] handler error:`, exc && exc.message ? exc.message : exc);
    return res.status(502).json({
      error: 'upstream_unavailable',
      message: 'Live market data is temporarily unavailable. Please try again in a few minutes.',
    });
  }
}