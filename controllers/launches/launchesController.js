import {
  fetchNewTokens,
  fetchAlmostBondedTokens,
  fetchMigratedTokens,
  fetchTrendingTokens,
} from '../../providers/bitquery.js';

const CACHE_TTL = 25_000;
const responseCache = new Map();
const inflightRequests = new Map();

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

export async function getLaunchesController(req, res, next) {
  try {
    const tab = req.query.tab || 'new';
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const cacheKey = `${tab}:${limit}`;

    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.response);
    }

    let inflight = inflightRequests.get(cacheKey);
    if (!inflight) {
      inflight = (async () => {
        let result;
        switch (tab) {
          case 'new':
            result = await fetchNewTokens(limit);
            break;
          case 'almost-bonded':
            result = await fetchAlmostBondedTokens(limit);
            break;
          case 'migrated':
            result = await fetchMigratedTokens(limit);
            break;
          case 'trending':
            result = await fetchTrendingTokens(limit);
            break;
          default:
            throw new Error('Invalid tab');
        }

        if (result.error) throw new Error(result.error);

        let tokens;
        switch (tab) {
          case 'new':
            tokens = mapNewTokens(result.tokens);
            break;
          case 'almost-bonded':
            tokens = mapAlmostBondedTokens(result.tokens);
            break;
          case 'migrated':
            tokens = mapMigratedTokens(result.tokens);
            break;
          case 'trending':
            tokens = mapTrendingTokens(result.tokens);
            break;
        }

        const response = {
          data: tokens,
          meta: {
            tab,
            count: tokens.length,
            source: 'bitquery',
            fetchedAt: new Date().toISOString(),
          },
        };

        responseCache.set(cacheKey, { response, timestamp: Date.now() });
        return response;
      })();

      inflightRequests.set(cacheKey, inflight);
      inflight.finally(() => inflightRequests.delete(cacheKey));
    }

    const response = await inflight;
    return res.json(response);
  } catch (exc) {
    return next(exc);
  }
}