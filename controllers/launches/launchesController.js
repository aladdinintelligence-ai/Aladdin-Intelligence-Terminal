import {
  fetchNewTokens,
  fetchAlmostBondedTokens,
  fetchMigratedTokens,
  fetchTrendingTokens,
  provider as dataProvider,
} from '../../providers/index.js';
import dl from '../../providers/dataLayer.js';
import { Token } from '../../models/token.model.js';

const IMAGE_CACHE_TTL = 300_000;
const imageCache = new Map();

const FETCH_OPTS = { feed: 'launches', priority: 'user' };

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

function ageMinutes(isoString) {
  if (!isoString) return null;
  return (Date.now() - new Date(isoString).getTime()) / 60000;
}

async function enrichWithImageUrls(tokens) {
  const mints = tokens.map((t) => t.mint).filter(Boolean);
  if (!mints.length) return tokens;

  // 1. Memory cache
  const imageMap = new Map();
  const missing = [];
  for (const mint of mints) {
    const cached = imageCache.get(mint);
    if (cached && Date.now() - cached.ts < IMAGE_CACHE_TTL) {
      if (cached.url) imageMap.set(mint, cached.url);
    } else {
      missing.push(mint);
    }
  }

  // 2. MongoDB
  if (missing.length) {
    const docs = await Token.find({ _id: { $in: missing } }).select('imageUrl').lean();
    for (const doc of docs) {
      if (doc.imageUrl) {
        imageMap.set(doc._id, doc.imageUrl);
        imageCache.set(doc._id, { url: doc.imageUrl, ts: Date.now() });
      }
    }
    const stillMissing = missing.filter((m) => !imageMap.has(m));

    // 3. DexScreener for any still missing (routes through the data layer:
    // token bucket, circuit breaker, budget accounting).
    if (stillMissing.length) {
      try {
        const res = await dl.dexBatch(stillMissing.slice(0, 30), { feed: 'launches' });
        if (res && !res.error) {
          for (const mint of stillMissing) {
            const pairs = res[mint] || [];
            const url = pairs[0]?.info?.imageUrl || null;
            if (url) imageMap.set(mint, url);
            imageCache.set(mint, { url, ts: Date.now() });
          }
        }
      } catch (err) {
        console.error(`[launches] DexScreener image fetch failed:`, err && err.message ? err.message : err);
      }
    }
  }

  return tokens.map((t) => ({
    ...t,
    imageUrl: imageMap.get(t.mint) || null,
  }));
}

function baseToken(t, lifecycle) {
  return {
    id: t.mint.slice(0, 8),
    mint: t.mint,
    symbol: t.symbol || t.mint.slice(0, 6).toUpperCase(),
    name: t.name || t.symbol || 'Unknown',
    color: generateColor(t.mint),
    lifecycle,
    marketCap: t.marketCapUsd || 0,
    liquidity: t.liquidityUsd || 0,
    volume: t.volume || 0,
    previousHourVolume: null,
    bondingProgress: t.bondingProgress ?? null,
    migratedMinutesAgo: null,
    holders: null,
    transactions: null,
    participants: { migrationSpecialists: 0, freshWallets: 0, scalpers: 0, unknown: 0 },
    walletContext: { sniperShare: null, bundlerShare: null, insiderPresent: false, creatorSelling: false },
    marketAddress: t.marketAddress || null,
  };
}

function mapNewTokens(rawTokens) {
  return rawTokens.map((t) => ({
    ...baseToken(t, 'new'),
    ageMinutes: ageMinutes(t.createdAt),
    createdAt: t.createdAt,
  }));
}

function mapAlmostBondedTokens(rawTokens) {
  return rawTokens.map((t) => ({
    ...baseToken(t, 'almost-bonded'),
    ageMinutes: ageMinutes(t.createdAt),
    createdAt: t.createdAt || null,
    volume: t.volume || 0,
  }));
}

function mapMigratedTokens(rawTokens) {
  return rawTokens.map((t) => ({
    ...baseToken(t, 'migrated'),
    ageMinutes: ageMinutes(t.migratedAt),
    migratedMinutesAgo: ageMinutes(t.migratedAt),
    bondingProgress: null,
    migratedAt: t.migratedAt,
    holders: t.holders ?? 0,
    transactions: t.transactions ?? 0,
  }));
}

function mapTrendingTokens(rawTokens) {
  return rawTokens.map((t) => ({
    ...baseToken(t, 'new'),
    ageMinutes: ageMinutes(t.createdAt),
    createdAt: t.createdAt || null,
    volume: t.volume || 0,
    priceUsd: t.priceUsd || null,
  }));
}

const fetchers = {
  new: fetchNewTokens,
  'almost-bonded': fetchAlmostBondedTokens,
  migrated: fetchMigratedTokens,
  trending: fetchTrendingTokens,
};

const mappers = {
  new: mapNewTokens,
  'almost-bonded': mapAlmostBondedTokens,
  migrated: mapMigratedTokens,
  trending: mapTrendingTokens,
};

// Full build pipeline wrapped so dl.fetch can cache/coalesce it and fall back
// to stale (or { unavailable }) when the provider is down. Any provider error
// surfaces as a throw; the data layer converts that into stale/unavailable,
// so raw upstream messages never reach the client.
async function buildLaunches(tab, limit) {
  const fetcher = fetchers[tab];
  if (!fetcher) throw Object.assign(new Error(`Invalid tab: ${tab}`), { status: 400 });
  const result = await fetcher(limit, FETCH_OPTS);
  if (result.error) {
    const err = new Error(result.error);
    err.status = 0;
    throw err;
  }
  const mapper = mappers[tab];
  const mapped = mapper(result.tokens);
  const tokens = await enrichWithImageUrls(mapped);
  return {
    data: tokens,
    meta: { tab, count: tokens.length, source: dataProvider },
  };
}

export async function getLaunchesController(req, res, next) {
  try {
    const tab = req.query.tab || 'new';
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const cacheKey = `launches:${tab}:${limit}`;

    const out = await dl.fetch({
      key: cacheKey,
      feed: 'launches',
      priority: 'user',
      request: () => buildLaunches(tab, limit),
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
    console.error(`[launches] handler error:`, exc && exc.message ? exc.message : exc);
    return res.status(502).json({
      error: 'upstream_unavailable',
      message: 'Live market data is temporarily unavailable. Please try again in a few minutes.',
    });
  }
}