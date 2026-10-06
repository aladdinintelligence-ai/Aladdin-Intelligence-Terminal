import axios from 'axios';
import { graphql as providerGraphql, provider as dataProvider } from '../../providers/index.js';

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';
const cache = new Map();
const inflight = new Map();
const CACHE_TTL = 120_000;

// Candidate pool and market thresholds mirror the formation workspace so the
// comparison universe is the live formation set.
const CANDIDATE_LIMIT = 200;
const MC_MIN = 5_000;
const LIQ_MIN = 1_500;
const FORMATION_MAX_AGE_DAYS = 30;

const TRADE_WINDOW_HOURS = 48;
const TRADE_GROUP_SIZE = 8;
const TRADE_ROW_LIMIT = 30000;
const SCAN_TOKENS = 24;
const MAX_TRADE_GROUPS = 4;
const PRICE_ROW_LIMIT = 4000;
const PRICE_LEGS_PER_TOKEN = 60;

// Nearest-neighbor match set per formation and outcomes counted against it.
const K_MATCHES = 6;

const ROUTER_WALLETS = new Set([
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM v4
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',  // Pump.fun AMM
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',  // Pump.fun AMM1
  'whirLbMiicVdio4qvUfM5KAg6Ct8VdjYdGkBcVTetXM',  // Orca Whirlpool
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Raydium CLMM
  'GVzSfkCoWkv4M1X9geDUxPnwK5cHY9vsHFiZUro9DD8V', // Meteora DLMM
  '11111111111111111111111111111111',
]);

const colors = [
  '#f1a8bf', '#55c7ea', '#8b7cf6', '#43c98b', '#d872f2',
  '#f2bd52', '#58a9f4', '#a697bb', '#ec795f', '#33d6a6',
  '#f1ce55', '#54cbb3', '#d99157', '#9b7cff', '#b89167',
  '#77a9ff', '#946cff', '#55d5ef', '#cf77d9', '#f39abe',
  '#f0a640', '#6b83ee', '#8990a0',
];

function isQuotaError(err) {
  const message = err?.message || '';
  return message.includes('402')
    || message.includes('429')
    || /quota|points limit|rate limit|session limit|concurrent/i.test(message);
}

function generateColor(mint) {
  let hash = 0;
  for (let i = 0; i < mint.length; i++) {
    hash = ((hash << 5) - hash + mint.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function ageDaysFrom(timestamp) {
  if (!timestamp) return null;
  const ms = Date.now() - new Date(timestamp).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}

function sinceIso(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function median(values) {
  const vals = values.filter(function (v) { return Number.isFinite(v); });
  if (vals.length === 0) return null;
  vals.sort(function (a, b) { return a - b; });
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 === 1 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

function mean(values) {
  const vals = values.filter(function (v) { return Number.isFinite(v); });
  if (vals.length === 0) return null;
  return vals.reduce(function (s, v) { return s + v; }, 0) / vals.length;
}

async function gqlWithRetry(query, label, attempts = 2) {
  let result = await providerGraphql(query, label);
  for (let attempt = 1; attempt < attempts; attempt++) {
    const transient = result.error && /socket|aborted|timeout|hang up|ECONNRESET|408/i.test(result.error);
    if (!transient) break;
    await new Promise(function (resolve) { setTimeout(resolve, 900); });
    result = await providerGraphql(query, label);
  }
  return result;
}

// Top traded meme tokens over 7d: the live formation universe we match across.
async function fetchVolumeLeaders() {
  const since7d = sinceIso(24 * 7);
  const query = `{
    Solana {
      trades: DEXTradeByTokens(
        limitBy: { by: Trade_Currency_MintAddress, count: 1 }
        limit: { count: ${CANDIDATE_LIMIT} }
        orderBy: { descendingByField: "VolumeInUSD" }
        where: {
          Trade: { Currency: { MintAddress: { endsWith: "pump" } } }
          Transaction: { Result: { Success: true } }
          Block: { Time: { since: "${since7d}" } }
        }
      ) {
        VolumeInUSD: sum(of: Trade_Side_AmountInUSD)
        Trade { Currency { MintAddress Name Symbol } }
      }
    }
  }`;

  const { error, data } = await gqlWithRetry(query, ':hist:leaders');
  if (error) throw new Error(error);

  const leaders = [];
  const seen = new Set();
  for (const row of (data && data.Solana && data.Solana.trades) || []) {
    const mint = row.Trade && row.Trade.Currency && row.Trade.Currency.MintAddress;
    if (!mint || seen.has(mint)) continue;
    seen.add(mint);
    leaders.push({
      mint,
      name: (row.Trade.Currency.Name) || '',
      symbol: (row.Trade.Currency.Symbol) || '',
      volume7d: parseFloat(row.VolumeInUSD) || 0,
    });
  }
  return leaders;
}

// Every pool token's DexScreener pairs: market metrics and migration split.
async function fetchPairsByMint(mints) {
  const pairsByMint = new Map();
  const chunks = [];
  for (let i = 0; i < mints.length; i += 30) chunks.push(mints.slice(i, i + 30));
  await Promise.all(chunks.slice(0, 8).map(async function (batch) {
    try {
      const { data } = await axios.get(DEXSCREENER_API + '/' + batch.join(','), { timeout: 10000 });
      for (const pair of (data && data.pairs) || []) {
        const addr = pair && pair.baseToken && pair.baseToken.address;
        if (!addr) continue;
        if (!pairsByMint.has(addr)) pairsByMint.set(addr, []);
        pairsByMint.get(addr).push(pair);
      }
    } catch (err) {
      console.error('[historical] DexScreener fetch failed:', err.message);
    }
  }));
  return pairsByMint;
}

function pickMarket(pairs) {
  const withLiquidity = pairs.slice().sort(function (a, b) {
    return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0);
  });
  const best = withLiquidity[0] || null;
  const launches = pairs
    .map(function (p) { return p.pairCreatedAt; })
    .filter(Boolean)
    .sort(function (a, b) { return a - b; });
  let bondVol = 0;
  let matureVol = 0;
  const BOND_DEX = new Set(['pumpfun', 'pump', 'pumpswap']);
  const MATURE_DEX = new Set(['raydium', 'meteora', 'orca']);
  for (const p of pairs) {
    const v = p && p.volume && p.volume.h24 != null ? Number(p.volume.h24) : 0;
    const dex = String(p.dexId || '').toLowerCase();
    if (MATURE_DEX.has(dex)) matureVol += v;
    else if (BOND_DEX.has(dex)) bondVol += v;
  }
  const migTotal = matureVol + bondVol;
  return {
    launchedAt: launches.length ? new Date(launches[0]).toISOString() : null,
    symbol: best && best.baseToken && best.baseToken.symbol,
    name: best && best.baseToken && best.baseToken.name,
    marketCapUsd: best ? (best.marketCap != null ? Number(best.marketCap) : (best.fdv != null ? Number(best.fdv) : 0)) : 0,
    liquidityUsd: best && best.liquidity && best.liquidity.usd != null ? Number(best.liquidity.usd) : 0,
    volume24h: best && best.volume && best.volume.h24 != null ? Number(best.volume.h24) : 0,
    change24h: best && best.priceChange && best.priceChange.h24 != null ? Number(best.priceChange.h24) : null,
    imageUrl: best && best.info && best.info.imageUrl ? best.info.imageUrl : null,
    migration: migTotal > 0 ? Math.round((matureVol / migTotal) * 100) : null,
  };
}

// Sampled recent legs per (mint, account): participation, concentration,
// profitable-wallet share and a retention proxy from bounded round trips.
async function fetchTradeRows(mints) {
  if (mints.length === 0) return [];
  const since = sinceIso(TRADE_WINDOW_HOURS);
  const groups = [];
  for (let i = 0; i < mints.length; i += TRADE_GROUP_SIZE) groups.push(mints.slice(i, i + TRADE_GROUP_SIZE));

  const queries = groups.slice(0, MAX_TRADE_GROUPS).map((group, idx) => {
    const quoted = group.map(function (m) { return '"' + m + '"'; }).join(', ');
    const query = `{
      Solana {
        DEXTradeByTokens(
          limitBy: { by: [Trade_Currency_MintAddress, Trade_Account_Address], count: 3 }
          limit: { count: ${TRADE_ROW_LIMIT} }
          orderBy: { descending: Block_Time }
          where: {
            Trade: { Currency: { MintAddress: { in: [${quoted}] } } }
            Transaction: { Result: { Success: true } }
            Block: { Time: { since: "${since}" } }
          }
        ) {
          Block { Time }
          Trade {
            Currency { MintAddress }
            Side { Type }
            Amount
            AmountInUSD
          }
          Transaction { FeePayer }
        }
      }
    }`;
    return gqlWithRetry(query, ':hist:trades:' + (idx + 1)).then(function (res) {
      if (res.error) throw new Error(res.error);
      return (res.data && res.data.Solana && res.data.Solana.DEXTradeByTokens) || [];
    });
  });

  const batches = await Promise.all(queries);
  return batches.flat();
}

// Recent implied price legs per token: max/latest gives the in-window peak
// multiple, a real "how far off its recent high" measure for each match.
async function fetchPriceRows(mints) {
  if (mints.length === 0) return [];
  const since = sinceIso(TRADE_WINDOW_HOURS);
  const groups = [];
  for (let i = 0; i < mints.length; i += TRADE_GROUP_SIZE) groups.push(mints.slice(i, i + TRADE_GROUP_SIZE));

  const queries = groups.slice(0, MAX_TRADE_GROUPS).map((group, idx) => {
    const quoted = group.map(function (m) { return '"' + m + '"'; }).join(', ');
    const query = `{
      Solana {
        DEXTradeByTokens(
          limitBy: { by: Trade_Currency_MintAddress, count: ${PRICE_LEGS_PER_TOKEN} }
          limit: { count: ${PRICE_ROW_LIMIT} }
          orderBy: { descending: Block_Time }
          where: {
            Trade: { Currency: { MintAddress: { in: [${quoted}] } } }
            Transaction: { Result: { Success: true } }
            Block: { Time: { since: "${since}" } }
          }
        ) {
          Block { Time }
          Trade { Currency { MintAddress } Amount AmountInUSD }
        }
      }
    }`;
    return gqlWithRetry(query, ':hist:prices:' + (idx + 1)).then(function (res) {
      if (res.error) throw new Error(res.error);
      return (res.data && res.data.Solana && res.data.Solana.DEXTradeByTokens) || [];
    });
  });

  const batches = await Promise.all(queries);
  return batches.flat();
}

function deriveMetrics(rows) {
  const byMint = new Map();
  for (const row of rows) {
    const trade = row.Trade || {};
    const mint = trade.Currency && trade.Currency.MintAddress;
    const wallet = row.Transaction && row.Transaction.FeePayer;
    const side = trade.Side && trade.Side.Type;
    const qty = parseFloat(trade.Amount) || 0;
    const usd = parseFloat(trade.AmountInUSD) || 0;
    if (!mint || !wallet || ROUTER_WALLETS.has(wallet)) continue;
    if (!['buy', 'sell'].includes(side) || qty <= 0) continue;
    if (!byMint.has(mint)) {
      byMint.set(mint, {
        buyUsd: 0, sellUsd: 0,
        wallets: new Map(), // wallet -> { buyQty, buyUsd, sellQty, sellUsd }
      });
    }
    const m = byMint.get(mint);
    if (!m.wallets.has(wallet)) m.wallets.set(wallet, { buyQty: 0, buyUsd: 0, sellQty: 0, sellUsd: 0 });
    const w = m.wallets.get(wallet);
    if (side === 'buy') { m.buyUsd += usd; w.buyQty += qty; w.buyUsd += usd; }
    else { m.sellUsd += usd; w.sellQty += qty; w.sellUsd += usd; }
  }

  const result = new Map();
  for (const [mint, m] of byMint) {
    const wallets = Array.from(m.wallets.values());
    let totalBuyQty = 0;
    for (const w of wallets) totalBuyQty += w.buyQty;
    const sorted = wallets.slice().sort(function (a, b) { return b.buyQty - a.buyQty; });
    const top1 = totalBuyQty > 0 ? sorted[0].buyQty / totalBuyQty : 0;
    const top10Qty = sorted.slice(0, 10).reduce(function (s, w) { return s + w.buyQty; }, 0);
    const top10 = totalBuyQty > 0 ? top10Qty / totalBuyQty : 0;

    let computable = 0;
    let wins = 0;
    for (const w of wallets) {
      if (w.buyQty > 0 && w.sellQty > 0) {
        computable++;
        const avgBuy = w.buyUsd / w.buyQty;
        const avgSell = w.sellUsd / w.sellQty;
        const matched = Math.min(w.buyQty, w.sellQty);
        if (matched * (avgSell - avgBuy) > 0) wins++;
      }
    }
    const profitable = computable > 0 ? Math.round((wins / computable) * 100) : null;
    const sellBuy = m.buyUsd > 0 ? m.sellUsd / m.buyUsd : null;
    const buyers = wallets.length;
    const retainedWallets = wallets.reduce(function (n, w) { return n + (w.sellQty < w.buyQty ? 1 : 0); }, 0);

    result.set(mint, {
      buyers,
      top1: Math.round(top1 * 100),
      top10: Math.round(top10 * 100),
      profitable,
      sellBuy,
      buyUsd: Math.round(m.buyUsd),
      sellUsd: Math.round(m.sellUsd),
      retained: buyers > 0 ? Math.round((retainedWallets / buyers) * 100) : null,
    });
  }
  return result;
}

function priceStats(rows) {
  const byMint = new Map();
  for (const row of rows) {
    const trade = row.Trade || {};
    const mint = trade.Currency && trade.Currency.MintAddress;
    const qty = parseFloat(trade.Amount) || 0;
    const usd = parseFloat(trade.AmountInUSD) || 0;
    const time = row.Block && row.Block.Time ? new Date(row.Block.Time).getTime() : null;
    if (!mint || qty <= 0 || usd <= 0 || time == null) continue;
    if (!byMint.has(mint)) byMint.set(mint, []);
    const price = usd / qty;
    if (Number.isFinite(price) && price > 0) byMint.get(mint).push({ price, time });
  }
  const out = new Map();
  for (const [mint, legs] of byMint) {
    if (legs.length < 2) { out.set(mint, { windowRange: null }); continue; }
    let max = -Infinity;
    let min = Infinity;
    for (const leg of legs) {
      if (leg.price > max) max = leg.price;
      if (leg.price < min) min = leg.price;
    }
    // In-window range multiple: how much the token moved between the highest
    // and lowest observed sampled price in the window.
    const windowRange = min > 0 ? max / min : null;
    out.set(mint, { windowRange: windowRange != null ? Math.min(Math.max(windowRange, 1), 50) : null });
  }
  return out;
}

function classify(m) {
  const change = m.change24h;
  const sellBuy = m.sellBuy;
  const top10 = m.top10;
  const migration = m.migration;
  if (sellBuy != null && sellBuy >= 1.5) return 'EXHAUSTION';
  if (change != null && change <= -40) return 'FAILED FORMATION';
  if (migration != null && migration >= 85 && m.profitable != null && m.profitable >= 15) return 'POST-MIGRATION EXPANSION';
  if (migration != null && migration > 20 && migration < 85) return 'MIGRATION POSITIONING';
  if (change != null && change <= -12 && top10 >= 30) return 'DISTRIBUTION';
  if (m.buyers >= 40 && top10 <= 45 && m.profitable != null && m.profitable >= 10) return 'BROAD ACCUMULATION';
  if (top10 >= 45 && m.buyers >= 30) return 'CONCENTRATED ACCUMULATION';
  if (m.buyers >= 20) return 'EARLY ACCUMULATION';
  return 'DISCOVERY';
}

// Similarity uses structure only (breadth, concentration, wallet quality,
// pressure, migration, age) - never the price outcome being classified.
function featureVector(m, norm) {
  const logBuyers = Math.log1p(Math.max(m.buyers, 1));
  return {
    buyers: norm.buyers.max > norm.buyers.min
      ? (logBuyers - norm.buyers.min) / (norm.buyers.max - norm.buyers.min) : 0.5,
    top10: m.top10 / 100,
    profitable: m.profitable != null ? m.profitable / 100 : 0,
    sellBuy: Math.min(m.sellBuy != null ? m.sellBuy : 0, 3) / 3,
    migration: (m.migration != null ? m.migration : 0) / 100,
    age: Math.log1p(m.ageDays != null ? m.ageDays : 0) / Math.log1p(30),
  };
}

function featureDistance(a, b) {
  let sum = 0;
  for (const key of ['buyers', 'top10', 'profitable', 'sellBuy', 'migration', 'age']) {
    const d = (a[key] || 0) - (b[key] || 0);
    sum += d * d;
  }
  return Math.sqrt(sum / 6);
}

function outcomeOf(m) {
  const change = m.change24h;
  if (change == null) return { state: 'flat', label: 'Flat' };
  if (change <= -15) return { state: 'failed', label: Math.round(change) + '%' };
  if (change >= 10) return { state: 'success', label: '+' + Math.round(change) + '%' };
  return { state: 'flat', label: Math.round(change) + '%' };
}

const FEATURE_LABELS = {
  buyers: 'buyer count',
  top10: 'top-10 concentration',
  profitable: 'profitable-wallet share',
  sellBuy: 'sell pressure',
  migration: 'migration progress',
  age: 'token age',
};

function biggestDifference(a, b) {
  let bestKey = null;
  let bestDelta = -Infinity;
  for (const key of Object.keys(FEATURE_LABELS)) {
    const d = Math.abs((a[key] || 0) - (b[key] || 0));
    if (d > bestDelta) { bestDelta = d; bestKey = key; }
  }
  const higher = (a[bestKey] || 0) > (b[bestKey] || 0);
  return FEATURE_LABELS[bestKey] + ' ' + (higher ? 'higher' : 'lower');
}

function buildMeta(count, coverage, marketError) {
  return {
    count,
    source: marketError ? dataProvider : dataProvider + '+dexscreener',
    fetchedAt: new Date().toISOString(),
    coverage,
    askTarget: '/ask-aladdin?q=' + encodeURIComponent('How did similar formations resolve?'),
  };
}

async function buildHistoricalResponse(limit) {
  const cacheKey = 'historical:' + limit;

  const leaders = await fetchVolumeLeaders();
  if (leaders.length === 0) {
    const empty = { data: [], hero: null, meta: buildMeta(0, 'No candidate tokens were available for historical matching.') };
    cache.set(cacheKey, { data: empty, ts: Date.now() });
    return empty;
  }

  const pairsByMint = await fetchPairsByMint(leaders.map(function (t) { return t.mint; }));

  const pool = [];
  let marketError = false;
  for (const leader of leaders) {
    const pairs = pairsByMint.get(leader.mint);
    if (!pairs || pairs.length === 0) continue;
    const market = pickMarket(pairs);
    if (market.volume24h <= 0 && market.marketCapUsd <= 0) continue;
    const ageDays = ageDaysFrom(market.launchedAt);
    if (market.marketCapUsd < MC_MIN || market.liquidityUsd < LIQ_MIN) continue;
    if (ageDays != null && ageDays > FORMATION_MAX_AGE_DAYS) continue;
    pool.push({
      mint: leader.mint,
      symbol: market.symbol || leader.symbol || leader.mint.slice(0, 6).toUpperCase(),
      name: market.name || leader.name || 'Unknown',
      ageDays,
      mc: market.marketCapUsd,
      liquidity: market.liquidityUsd,
      volume24h: market.volume24h,
      change24h: market.change24h,
      imageUrl: market.imageUrl,
      migration: market.migration,
    });
  }

  if (pool.length === 0) {
    const empty = { data: [], hero: null, meta: buildMeta(0, 'No forming tokens matched the current market thresholds.') };
    cache.set(cacheKey, { data: empty, ts: Date.now() });
    return empty;
  }

  pool.sort(function (a, b) { return b.volume24h - a.volume24h; });
  const scanned = pool.slice(0, SCAN_TOKENS);

  const [rows, priceRows] = await Promise.all([
    fetchTradeRows(scanned.map(function (t) { return t.mint; })),
    fetchPriceRows(scanned.map(function (t) { return t.mint; })),
  ]);
  const metrics = deriveMetrics(rows);
  const prices = priceStats(priceRows.concat(rows));

  // Build the matchable universe with all features plus observed outcomes.
  const universe = [];
  for (const t of scanned) {
    const m = metrics.get(t.mint);
    if (!m || m.buyers === 0) continue;
    const price = prices.get(t.mint) || {};
    universe.push({
      mint: t.mint,
      symbol: t.symbol,
      name: t.name,
      ageDays: t.ageDays,
      mc: t.mc,
      liquidity: t.liquidity,
      volume24h: t.volume24h,
      change24h: t.change24h,
      imageUrl: t.imageUrl,
      migration: t.migration,
      windowRange: price.windowRange != null ? price.windowRange : null,
      buyers: m.buyers,
      top1: m.top1,
      top10: m.top10,
      profitable: m.profitable,
      sellBuy: m.sellBuy,
      retained: m.retained,
    });
  }

  if (universe.length < 3) {
    const empty = { data: [], hero: null, meta: buildMeta(0, 'The current formation pool is too small for reliable matching.') };
    cache.set(cacheKey, { data: empty, ts: Date.now() });
    return empty;
  }

  // Normalization bounds from the live universe.
  const logBuyers = universe.map(function (u) { return Math.log1p(Math.max(u.buyers, 1)); });
  const norm = {
    buyers: { min: Math.min.apply(null, logBuyers), max: Math.max.apply(null, logBuyers) },
  };

  const vectors = new Map(universe.map(function (u) {
    return [u.mint, featureVector(u, norm)];
  }));

  // Pairwise distance matrix for a stable 0-100 similarity scale.
  let maxPairDist = 0;
  for (let i = 0; i < universe.length; i++) {
    for (let j = i + 1; j < universe.length; j++) {
      const d = featureDistance(vectors.get(universe[i].mint), vectors.get(universe[j].mint));
      if (d > maxPairDist) maxPairDist = d;
    }
  }
  const distScale = maxPairDist > 0 ? maxPairDist : 1;

  // Nearest neighbors per formation, excluding itself.
  const neighbors = new Map();
  for (const target of universe) {
    const tv = vectors.get(target.mint);
    const scored = universe
      .filter(function (u) { return u.mint !== target.mint; })
      .map(function (u) {
        const d = featureDistance(tv, vectors.get(u.mint));
        const similarity = Math.round(100 * (1 - d / distScale));
        return { token: u, distance: d, similarity: clamp(similarity, 1, 99) };
      })
      .sort(function (a, b) { return a.distance - b.distance || b.token.volume24h - a.token.volume24h; })
      .slice(0, K_MATCHES);
    neighbors.set(target.mint, scored);
  }

  const allMatches = [];
  for (const list of neighbors.values()) for (const entry of list) allMatches.push(entry);

  const hero = {
    analyzed: universe.length,
    matches: allMatches.length,
    medianPeak: median(allMatches.map(function (e) { return e.token.windowRange; })),
    medianSimilarity: median(allMatches.map(function (e) { return e.similarity; })),
    successful: allMatches.reduce(function (n, e) { return n + (outcomeOf(e.token).state === 'success' ? 1 : 0); }, 0),
    failed: allMatches.reduce(function (n, e) { return n + (outcomeOf(e.token).state === 'failed' ? 1 : 0); }, 0),
    flat: allMatches.reduce(function (n, e) { return n + (outcomeOf(e.token).state === 'flat' ? 1 : 0); }, 0),
  };

  // Differences for a formation: its own metrics vs the medians of the similar
  // set currently resolving up (falling back to the full similar set).
  function buildDifferences(target, matchEntries) {
    const successes = matchEntries.filter(function (e) { return outcomeOf(e.token).state === 'success'; });
    const ref = successes.length >= 2 ? successes : matchEntries;
    const med = {
      top10: median(ref.map(function (e) { return e.token.top10; })),
      profitable: median(ref.map(function (e) { return e.token.profitable; })),
      retained: median(ref.map(function (e) { return e.token.retained; })),
      sellBuy: median(ref.map(function (e) { return e.token.sellBuy; })),
    };
    const candidates = [];
    const push = (text, mag) => { if (text) candidates.push({ text, mag }); };
    const delta = (mine, theirs) => mine == null || theirs == null ? null : Math.abs(mine - theirs);

    push(target.top10 != null && med.top10 != null
      ? 'Top-10 concentration is ' + (target.top10 > med.top10 ? 'higher' : 'lower') + ' - '
        + qround(target.top10) + '% vs ' + qround(med.top10) + '% in its successful subset.'
      : null, delta(target.top10, med.top10));
    push(target.profitable != null && med.profitable != null
      ? 'Profitable-wallet share is ' + (target.profitable > med.profitable ? 'higher' : 'lower') + ' - '
        + qround(target.profitable) + '% vs ' + qround(med.profitable) + '% in its successful subset.'
      : null, delta(target.profitable, med.profitable));
    push(target.retained != null && med.retained != null
      ? 'Retention is ' + (target.retained > med.retained ? 'higher' : 'lower') + ' - '
        + qround(target.retained) + '% vs ' + qround(med.retained) + '% in its successful subset.'
      : null, delta(target.retained, med.retained));
    push(target.sellBuy != null && med.sellBuy != null
      ? 'Sell/buy flow is ' + (target.sellBuy > med.sellBuy ? 'higher' : 'lower') + ' - '
        + qround(target.sellBuy) + 'x vs ' + qround(med.sellBuy) + 'x in its successful subset.'
      : null, delta(target.sellBuy, med.sellBuy));

    candidates.sort(function (a, b) { return (b.mag || 0) - (a.mag || 0); });
    if (candidates.length === 0 && successes.length < 2) {
      return ['No similar formation is currently resolving up in the sampled window.'];
    }
    return candidates.slice(0, 3).map(function (c) { return c.text; });
  }

  function qround(v) { return Math.round(v * 10) / 10; }

  const scored = [];
  for (const target of universe) {
    const entries = neighbors.get(target.mint);
    const sims = entries.map(function (e) { return e.similarity; });
    const similar = mean(sims);
    const medianPeak = median(entries.map(function (e) { return e.token.windowRange; }));
    const successful = entries.reduce(function (n, e) { return n + (outcomeOf(e.token).state === 'success' ? 1 : 0); }, 0);
    const failed = entries.reduce(function (n, e) { return n + (outcomeOf(e.token).state === 'failed' ? 1 : 0); }, 0);
    const top = entries[0] ? entries[0] : null;
    const stage = classify(target);
    const isChanged = ['PARTICIPATION EXPANSION', 'MIGRATION POSITIONING', 'POST-MIGRATION EXPANSION', 'DISTRIBUTION', 'ROTATION'].includes(stage);
    const why = (entries.length) + ' similar formations (avg ' + Math.round(similar) + '% match): median peak ' + (medianPeak != null ? medianPeak.toFixed(1) + 'x' : 'n/a')
      + ', ' + successful + ' resolving up · ' + failed + ' resolving down. Similarity is context, not a prediction.';

    scored.push({
      mint: target.mint,
      symbol: target.symbol,
      name: target.name,
      color: generateColor(target.mint),
      imageUrl: target.imageUrl,
      formation: stage,
      mc: target.mc,
      change: target.change24h,
      liquidity: target.liquidity,
      volume: target.volume24h,
      ageDays: target.ageDays,
      buyers: target.buyers,
      top1: target.top1,
      top10: target.top10,
      profitable: target.profitable,
      retained: target.retained,
      migration: target.migration,
      peak: target.windowRange,
      matchCount: entries.length,
      similarity: Math.round(similar),
      medianPeak,
      successful,
      failed,
      signal: similar != null && Math.round(similar) >= 70 && successful > failed,
      isNew: target.ageDays == null || target.ageDays < 14,
      isChanged,
      why,
      topMatch: top ? {
        symbol: top.token.symbol,
        similarity: top.similarity,
        peak: top.token.windowRange,
        outcome: outcomeOf(top.token).label,
        difference: biggestDifference(vectors.get(target.mint), vectors.get(top.token.mint)),
      } : null,
    });
  }

  scored.sort(function (a, b) { return (b.similarity - a.similarity) || (b.volume - a.volume); });

  const byMint = new Map(universe.map(function (u) { return [u.mint, u]; }));
  for (const t of scored) {
    const target = byMint.get(t.mint);
    const entries = neighbors.get(t.mint);
    t.differences = target ? buildDifferences(target, entries) : [];
    t.id = t.mint.slice(0, 8);
  }

  const selected = scored.slice(0, limit);

  const coverage = marketError
    ? 'Historical matching uses the live formation universe; outcome detail temporarily limited while market data recovers.'
    : 'Each live formation is matched to its nearest neighbours in the current active pool using observed structure only (buyer breadth, top-10 concentration, profitable-wallet share, sell pressure, migration progress and age). Outcomes are each similar token\u2019s observed recent resolution: 24h change, in-window price range (high versus low across the most recent sampled DEX legs per token over 48h), sell pressure and a retention proxy (buyers still holding on the sampled legs). Match counts, median peaks and successful/failed subsets come from those observed outcomes. Similarity describes observed features and does not predict a guaranteed outcome.';

  const response = { data: selected, hero, meta: buildMeta(selected.length, coverage, marketError) };
  cache.set(cacheKey, { data: response, ts: Date.now() });
  return response;
}

function buildOrJoin(limit) {
  const cacheKey = 'historical:' + limit;
  const existing = inflight.get(cacheKey);
  if (existing) return existing;
  const pending = buildHistoricalResponse(limit);
  inflight.set(cacheKey, pending);
  pending.finally(function () { inflight.delete(cacheKey); }).catch(function () { /* swallowed by caller */ });
  return pending;
}

export async function getHistoricalController(req, res, next) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 6, 1), 20);
  try {
    const cached = cache.get('historical:' + limit);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return res.json(cached.data);
    }

    return res.json(await buildOrJoin(limit));
  } catch (exc) {
    const stale = cache.get('historical:' + limit);
    if (stale && stale.data && stale.data.data) {
      return res.json(stale.data);
    }
    if (isQuotaError(exc)) {
      return res.status(503).json({
        error: 'provider_quota',
        message: 'Live historical matching is temporarily unavailable. Please try again in a few minutes.',
      });
    }
    return next(exc);
  }
}

async function refreshDefaultCache() {
  try {
    await buildOrJoin(6);
  } catch (err) {
    console.error('[historical] cache refresh failed:', err.message);
  }
}
// Phase-shifted from the other intelligence controllers so startup and
// interval refreshes never fire at the same moment.
setTimeout(refreshDefaultCache, 18000);
setInterval(refreshDefaultCache, 122_000);