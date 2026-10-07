import { fetchMovers as fetchMoversFromProvider, provider as dataProvider } from '../../providers/index.js';
import dl from '../../providers/dataLayer.js';

const FETCH_OPTS = { feed: 'movers', priority: 'user' };

function generateColor(mint) {
  const colors = [
    '#f1a8bf', '#55c7ea', '#8b7cf6', '#43c98b', '#d872f2',
    '#f2bd52', '#58a9f4', '#a697bb', '#ec795f', '#33d6a6',
    '#f1ce55', '#54cbb3', '#d99157', '#9b7cff', '#b89167',
    '#77a9ff', '#946cff', '#55d5ef', '#cf77d9', '#f39abe',
    '#f0a640', '#6b83ee', '#8990a0',
  ];
  let hash = 0;
  for (let i = 0; i < mint.length; i++) {
    hash = ((hash << 5) - hash + mint.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

function classifyFormation(token) {
  const mc = token.marketCapUsd || 0;
  const liq = token.liquidityUsd || 0;
  const vol = token.volume24h || 0;
  const buyers = token.buyers || 0;

  if (mc < 5000) return 'DISCOVERY';
  if (mc < 20000 && buyers < 50) return 'EARLY ACCUMULATION';
  if (mc < 50000 && buyers < 150) return 'PARTICIPATION EXPANSION';
  if (mc < 100000 && vol > mc * 0.3) return 'BROAD ACCUMULATION';
  if (mc < 200000 && liq > mc * 0.15) return 'MIGRATION POSITIONING';
  if (mc >= 200000 && buyers > 200) return 'POST-MIGRATION EXPANSION';
  return 'CONCENTRATED ACCUMULATION';
}

// Fetch ALL market data from DexScreener (price, mc, liquidity, priceChange,
// imageUrl) routed through the data layer. Returns a map mint -> first pair.
async function fetchDexMarketData(mints) {
  const res = await dl.dexBatch(mints, { feed: 'movers' });
  if (res.error) return new Map();
  const dexMap = new Map();
  for (const mint of mints) {
    const pair = (res[mint] || [])[0];
    if (!pair) continue;
    dexMap.set(mint, {
      symbol: pair?.baseToken?.symbol || null,
      name: pair?.baseToken?.name || null,
      priceUsd: pair?.priceUsd != null ? Number(pair.priceUsd) : null,
      marketCapUsd: pair?.marketCap != null ? Number(pair.marketCap) : (pair?.fdv != null ? Number(pair.fdv) : null),
      liquidityUsd: pair?.liquidity?.usd != null ? Number(pair.liquidity.usd) : null,
      volume24h: pair?.volume?.h24 != null ? Number(pair.volume.h24) : null,
      priceChange24h: pair?.priceChange?.h24 != null ? Number(pair.priceChange.h24) : null,
      imageUrl: pair?.info?.imageUrl || null,
    });
  }
  return dexMap;
}

// Full build pipeline wrapped so dl.fetch can cache/coalesce and fall back to
// stale (or { unavailable }) when providers are down.
async function buildMovers(limit) {
  const { error, tokens: providerTokens } = await fetchMoversFromProvider(limit, FETCH_OPTS);
  if (error) {
    const err = new Error(error);
    err.status = 0;
    throw err;
  }

  const empty = { data: [], meta: { count: 0, source: `${dataProvider}+dexscreener` } };
  if (!providerTokens.length) return empty;

  const mints = providerTokens.map((t) => t.mint);
  const dexMap = await fetchDexMarketData(mints);

  // Combine: Provider (volume, buyers) + DexScreener (price, mc, liq, change, image).
  const tokens = providerTokens
    .map((t) => {
      const dex = dexMap.get(t.mint) || {};
      return {
        id: t.mint.slice(0, 8),
        mint: t.mint,
        symbol: dex.symbol || t.symbol || t.mint.slice(0, 6).toUpperCase(),
        name: dex.name || t.name || 'Unknown',
        mc: dex.marketCapUsd ?? 0,
        liquidity: dex.liquidityUsd ?? 0,
        volume: dex.volume24h ?? t.volume ?? 0,
        buyers: t.buyers || 0,
        formation: classifyFormation({
          marketCapUsd: dex.marketCapUsd,
          liquidityUsd: dex.liquidityUsd,
          volume24h: dex.volume24h,
          buyers: t.buyers,
        }),
        change: dex.priceChange24h ?? 0,
        color: generateColor(t.mint),
        imageUrl: dex.imageUrl || null,
      };
    })
    .filter((t) => t.mc > 0 && t.change !== 0);

  return {
    data: tokens,
    meta: { count: tokens.length, source: `${dataProvider}+dexscreener` },
  };
}

export async function getMoversController(req, res, next) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const cacheKey = `movers:${limit}`;

    const out = await dl.fetch({
      key: cacheKey,
      feed: 'movers',
      priority: 'user',
      request: () => buildMovers(limit),
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
    console.error(`[movers] handler error:`, exc && exc.message ? exc.message : exc);
    return res.status(502).json({
      error: 'upstream_unavailable',
      message: 'Live market data is temporarily unavailable. Please try again in a few minutes.',
    });
  }
}