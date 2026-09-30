import {
  fetchNewTokens,
  fetchAlmostBondedTokens,
  fetchMigratedTokens,
  fetchTrendingTokens,
  provider as dataProvider,
} from '../../providers/index.js';
import { Token } from '../../models/token.model.js';
import axios from 'axios';

const CACHE_TTL = 120_000;
const STALE_TTL = 300_000;
const QUOTA_COOLDOWN_MS = 5 * 60_000;
const responseCache = new Map();
const inflightRequests = new Map();
let quotaCooldownUntil = 0;

function isQuotaError(err) {
  const message = err?.message || '';
  return message.includes('402') || /quota|points limit|rate limit/i.test(message);
}

function scheduleRefresh(tab, limit, cacheKey) {
  if (inflightRequests.has(cacheKey)) return inflightRequests.get(cacheKey);
  const inflight = refreshCache(tab, limit, cacheKey);
  inflightRequests.set(cacheKey, inflight);
  inflight
    .catch((err) => {
      console.error(`[launches] background refresh failed for ${tab}:`, err.message);
    })
    .finally(() => inflightRequests.delete(cacheKey));
  return inflight;
}

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';
const imageCache = new Map();
const IMAGE_CACHE_TTL = 300_000;

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
  return Math.round((Date.now() - new Date(isoString).getTime()) / 60000);
}

async function enrichWithImageUrls(tokens) {
  const mints = tokens.map((t) => t.mint).filter(Boolean);
  if (!mints.length) return tokens;

  // 1. Check memory cache
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

  // 2. Check MongoDB for remaining
  if (missing.length) {
    const docs = await Token.find({ _id: { $in: missing } }).select('imageUrl').lean();
    for (const doc of docs) {
      if (doc.imageUrl) {
        imageMap.set(doc._id, doc.imageUrl);
        imageCache.set(doc._id, { url: doc.imageUrl, ts: Date.now() });
      }
    }
    const stillMissing = missing.filter((m) => !imageMap.has(m));

    // 3. Fetch from DexScreener for any still missing (batch up to 30)
    if (stillMissing.length) {
      try {
        const batch = stillMissing.slice(0, 30);
        const { data } = await axios.get(`${DEXSCREENER_API}/${batch.join(',')}`, { timeout: 8000 });
        const pairs = data?.pairs || [];
        for (const pair of pairs) {
          const mint = pair?.baseToken?.address;
          const url = pair?.info?.imageUrl || null;
          if (mint && url) {
            imageMap.set(mint, url);
            imageCache.set(mint, { url, ts: Date.now() });
          }
        }
        // Cache misses too so we don't re-fetch
        for (const mint of stillMissing) {
          if (!imageMap.has(mint)) {
            imageCache.set(mint, { url: null, ts: Date.now() });
          }
        }
      } catch (err) {
        console.error(`[launches] DexScreener image fetch failed:`, err.message);
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

async function fetchWithRetry(tab, limit, retries = 2) {
  const fetcher = fetchers[tab];
  if (!fetcher) throw new Error('Invalid tab');

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetcher(limit);
    } catch (err) {
      const is429 = err?.message?.includes('429') || err?.status === 429;
      if (is429 && attempt < retries) {
        const delay = 2000 * (attempt + 1);
        console.log(`[launches] 429 on ${tab}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

export async function getLaunchesController(req, res, next) {
  try {
    const tab = req.query.tab || 'new';
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const cacheKey = `${tab}:${limit}`;

    const cached = responseCache.get(cacheKey);
    const age = cached ? Date.now() - cached.timestamp : Infinity;

    if (age < CACHE_TTL) {
      return res.json(cached.response);
    }

    if (age < STALE_TTL && cached) {
      res.json(cached.response);
      scheduleRefresh(tab, limit, cacheKey);
      return;
    }

    const inflight = scheduleRefresh(tab, limit, cacheKey);

    const response = await inflight;
    return res.json(response);
  } catch (exc) {
    const cached = responseCache.get(`${req.query.tab || 'new'}:${req.query.limit || 50}`);
    if (cached) {
      console.log(`[launches] Serving stale cache for ${req.query.tab} after error`);
      return res.json(cached.response);
    }
    if (isQuotaError(exc)) {
      return res.status(503).json({
        error: 'provider_quota',
        message: 'Live market data is temporarily unavailable. Please try again in a few minutes.',
      });
    }
    return next(exc);
  }
}

async function refreshCache(tab, limit, cacheKey) {
  if (Date.now() < quotaCooldownUntil) {
    console.log(`[launches] Skipping ${tab} refresh while provider quota is on cooldown`);
    const stale = responseCache.get(cacheKey);
    if (stale) return stale.response;
    const err = new Error('Provider quota exceeded (cooldown)');
    err.status = 402;
    throw err;
  }
  try {
    const result = await fetchWithRetry(tab, limit);

    if (result.error) {
      if (isQuotaError(result.error)) quotaCooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
      throw new Error(result.error);
    }

    const mapper = mappers[tab];
    const mapped = mapper(result.tokens);
    const tokens = await enrichWithImageUrls(mapped);

    const response = {
      data: tokens,
      meta: {
        tab,
        count: tokens.length,
        source: dataProvider,
        fetchedAt: new Date().toISOString(),
      },
    };

    responseCache.set(cacheKey, { response, timestamp: Date.now() });
    return response;
  } catch (err) {
    if (isQuotaError(err)) quotaCooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
    console.error(`[launches] Failed to fetch ${tab}:`, err.message);
    const stale = responseCache.get(cacheKey);
    if (stale) return stale.response;
    throw err;
  }
}
