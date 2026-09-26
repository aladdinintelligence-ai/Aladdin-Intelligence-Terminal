import axios from 'axios';
import { fetchMovers as fetchMoversFromProvider, provider as dataProvider } from '../../providers/index.js';

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';
const cache = new Map();
const CACHE_TTL = 120_000;

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

export async function getMoversController(req, res, next) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const cacheKey = `movers:${limit}`;

    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return res.json(cached.data);
    }

    // 1. Fetch top tokens by volume from Bitquery (identifies movers)
    const { error, tokens: providerTokens } = await fetchMoversFromProvider(limit);
    if (error) throw new Error(error);

    if (providerTokens.length === 0) {
      const empty = { data: [], meta: { count: 0, source: dataProvider, fetchedAt: new Date().toISOString() } };
      return res.json(empty);
    }

    // 2. Fetch ALL market data from DexScreener (price, mc, liquidity, priceChange, imageUrl)
    const mints = providerTokens.map(t => t.mint);
    const dexMap = new Map();
    try {
      // DexScreener supports batch lookups (max ~30 per request)
      const batch = mints.slice(0, 30);
      const { data } = await axios.get(`${DEXSCREENER_API}/${batch.join(',')}`, { timeout: 10000 });
      for (const pair of (data?.pairs || [])) {
        const addr = pair?.baseToken?.address;
        if (!addr) continue;
        // Use first pair per token (highest liquidity by default from DexScreener)
        if (dexMap.has(addr)) continue;
        dexMap.set(addr, {
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
    } catch (err) {
      console.error(`[movers] DexScreener fetch failed:`, err.message);
    }

    // 3. Combine: Provider (volume, buyers) + DexScreener (price, mc, liq, change, image)
    // Only include tokens that have market data from DexScreener
    const tokens = providerTokens
      .map(t => {
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
      .filter(t => t.mc > 0 && t.change !== 0);

    const response = {
      data: tokens,
      meta: {
        count: tokens.length,
        source: `${dataProvider}+dexscreener`,
        fetchedAt: new Date().toISOString(),
      },
    };

    cache.set(cacheKey, { data: response, ts: Date.now() });
    return res.json(response);
  } catch (exc) {
    return next(exc);
  }
}
