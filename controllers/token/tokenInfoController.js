import dl from '../../providers/dataLayer.js';

const DEXSCREENER_TTL = 30_000;

const cache = new Map();

// Token info is DexScreener-only (Jupiter's price/v2 endpoint has been
// retired upstream and now always 404s). Pairs come through the data layer's
// dexBatch so this route shares the app-wide DexScreener rate limit, retries
// and breaker instead of hammering the API with raw axios calls.
export async function getTokenInfoController(req, res, next) {
  try {
    const { mint } = req.params;
    if (!mint || mint.length < 32) {
      return res.status(400).json({ error: 'Invalid mint address' });
    }

    const cached = cache.get(mint);
    if (cached && Date.now() - cached.ts < DEXSCREENER_TTL) {
      return res.json(cached.data);
    }

    const result = await dl.dexBatch([mint], { feed: 'tokenInfo' });
    if (result.error) {
      // Upstream unavailable: transient by nature - 503 so clients retry,
      // never a 404 "Token not found" for a token that may exist.
      return res.status(503).json({
        error: 'upstream_unavailable',
        message: 'Token data is temporarily unavailable. Please try again in a few seconds.',
      });
    }

    const pair = (result[mint] || [])[0] || null;
    if (!pair) {
      return res.status(404).json({ error: 'Token not found', mint });
    }

    const info = {
      mint,
      symbol: pair?.baseToken?.symbol || mint.slice(0, 6).toUpperCase(),
      name: pair?.baseToken?.name || 'Unknown Token',
      imageUrl: pair?.info?.imageUrl || null,
      priceUsd: pair?.priceUsd != null ? Number(pair.priceUsd) : null,
      marketCapUsd: pair?.marketCap != null ? Number(pair.marketCap) : (pair?.fdv != null ? Number(pair.fdv) : null),
      liquidityUsd: pair?.liquidity?.usd != null ? Number(pair.liquidity.usd) : null,
      volume24h: pair?.volume?.h24 != null ? Number(pair.volume.h24) : null,
      volume6h: pair?.volume?.h6 != null ? Number(pair.volume.h6) : null,
      volume1h: pair?.volume?.h1 != null ? Number(pair.volume.h1) : null,
      priceChange24h: pair?.priceChange?.h24 != null ? Number(pair.priceChange.h24) : null,
      priceChange6h: pair?.priceChange?.h6 != null ? Number(pair.priceChange.h6) : null,
      priceChange1h: pair?.priceChange?.h1 != null ? Number(pair.priceChange.h1) : null,
      txns24h: pair?.txns?.h24 || null,
      pairAddress: pair?.pairAddress || null,
      dexId: pair?.dexId || null,
      pairCreatedAt: pair?.pairCreatedAt || null,
      url: pair?.url || null,
      website: pair?.info?.websites?.[0]?.url || null,
      socials: pair?.info?.socials || [],
    };

    cache.set(mint, { data: info, ts: Date.now() });
    return res.json(info);
  } catch (exc) {
    return next(exc);
  }
}
