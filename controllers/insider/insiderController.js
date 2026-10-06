import axios from 'axios';
import { graphql as providerGraphql, provider as dataProvider } from '../../providers/index.js';

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';
const cache = new Map();
const inflight = new Map();
const CACHE_TTL = 120_000;

const CANDIDATE_LIMIT = 200;
const INSIDER_MAX_AGE_DAYS = 14;
const MC_MIN = 10_000;
const LIQ_MIN = 2_000;

// Cohort semantics: Bitquery reliably serves the most recent trades per
// (mint, wallet) inside a window, so the "early-entry" cohort is defined as
// wallets whose sampled history STARTS with a buy — a visible recent entry
// rather than a claim about the pair-launch instant.
const RECENT_WINDOW_HOURS = 48;
const SCAN_COUNT = 12;
const SCAN_GROUP_SIZE = 4;
const RECENT_ROW_LIMIT = 30000;
const MAX_SCAN_GROUPS = 3;

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

function shortAddress(address) {
  return String(address || '').slice(0, 6);
}

function ageDaysFrom(timestamp) {
  if (!timestamp) return null;
  const ms = Date.now() - new Date(timestamp).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}

function sinceIso(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
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

// Top traded meme tokens over 7d: pool of freshly launched candidates.
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

  const { error, data } = await gqlWithRetry(query, ':insider:leaders');
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
      console.error('[insider] DexScreener fetch failed:', err.message);
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
  return {
    launchedAt: launches.length ? new Date(launches[0]).toISOString() : null,
    symbol: best && best.baseToken && best.baseToken.symbol,
    name: best && best.baseToken && best.baseToken.name,
    marketCapUsd: best ? (best.marketCap != null ? Number(best.marketCap) : (best.fdv != null ? Number(best.fdv) : 0)) : 0,
    liquidityUsd: best && best.liquidity && best.liquidity.usd != null ? Number(best.liquidity.usd) : 0,
    volume24h: best && best.volume && best.volume.h24 != null ? Number(best.volume.h24) : 0,
    change24h: best && best.priceChange && best.priceChange.h24 != null ? Number(best.priceChange.h24) : null,
    imageUrl: best && best.info && best.info.imageUrl ? best.info.imageUrl : null,
  };
}

// Sampled recent legs per (mint, account) over the redistribution window.
async function fetchRecentTrades(mints) {
  if (mints.length === 0) return [];
  const since = sinceIso(RECENT_WINDOW_HOURS);
  const groups = [];
  for (let i = 0; i < mints.length; i += SCAN_GROUP_SIZE) groups.push(mints.slice(i, i + SCAN_GROUP_SIZE));

  const queries = groups.slice(0, MAX_SCAN_GROUPS).map((group, idx) => {
    const quoted = group.map(function (m) { return '"' + m + '"'; }).join(', ');
    const query = `{
      Solana {
        DEXTradeByTokens(
          limitBy: { by: [Trade_Currency_MintAddress, Trade_Account_Address], count: 3 }
          limit: { count: ${RECENT_ROW_LIMIT} }
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
            Account { Address }
            Amount
            AmountInUSD
            PriceInUSD
          }
          Transaction { FeePayer }
        }
      }
    }`;
    return gqlWithRetry(query, ':insider:recent:' + (idx + 1)).then(function (res) {
      if (res.error) throw new Error(res.error);
      return (res.data && res.data.Solana && res.data.Solana.DEXTradeByTokens) || [];
    });
  });

  const batches = await Promise.all(queries);
  return batches.flat();
}

function lastPriceByMint(rows) {
  const last = new Map();
  for (const row of rows) {
    const mint = row.Trade && row.Trade.Currency && row.Trade.Currency.MintAddress;
    const price = row.Trade && parseFloat(row.Trade.PriceInUSD);
    if (mint && Number.isFinite(price) && price > 0) last.set(mint, price);
  }
  return last;
}

// Recent per (wallet, mint) legs in the redistribution window: bounded
// average-cost realized PnL, sell ratio, remaining position and the wallet's
// OLDEST sampled leg (the entry edge of its sampled history).
function recentLegsByWalletMint(rows) {
  const map = new Map();
  for (const row of rows) {
    const trade = row.Trade || {};
    const mint = trade.Currency && trade.Currency.MintAddress;
    const wallet = row.Transaction && row.Transaction.FeePayer;
    const side = trade.Side && trade.Side.Type;
    const qty = parseFloat(trade.Amount) || 0;
    const usd = parseFloat(trade.AmountInUSD) || 0;
    const time = row.Block && row.Block.Time ? new Date(row.Block.Time).getTime() : null;
    if (!mint || !wallet || ROUTER_WALLETS.has(wallet)) continue;
    if (!['buy', 'sell'].includes(side) || qty <= 0) continue;

    const key = wallet + '|' + mint;
    if (!map.has(key)) {
      map.set(key, { wallet, mint, buyQty: 0, buyUsd: 0, sellQty: 0, sellUsd: 0, minTime: null, minTimeSide: null, minTimeUsd: 0 });
    }
    const legs = map.get(key);
    if (side === 'buy') {
      legs.buyQty += qty;
      legs.buyUsd += usd;
    } else {
      legs.sellQty += qty;
      legs.sellUsd += usd;
    }
    if (time != null && (legs.minTime == null || time < legs.minTime)) {
      legs.minTime = time;
      legs.minTimeSide = side;
      legs.minTimeUsd = usd;
    }
  }
  return map;
}

// Distinct buying wallets per mint over the redistribution window.
function recentBuyerCount(rows) {
  const buyers = new Map();
  for (const row of rows) {
    const trade = row.Trade || {};
    const mint = trade.Currency && trade.Currency.MintAddress;
    const wallet = row.Transaction && row.Transaction.FeePayer;
    const side = trade.Side && trade.Side.Type;
    if (!mint || !wallet || ROUTER_WALLETS.has(wallet)) continue;
    if (side !== 'buy') continue;
    if (!buyers.has(mint)) buyers.set(mint, new Set());
    buyers.get(mint).add(wallet);
  }
  const counts = new Map();
  for (const [mint, set] of buyers) counts.set(mint, set.size);
  return counts;
}

function insiderStage(pressure, avgSold) {
  if (avgSold != null && avgSold >= 85) return 'EXITING';
  if (pressure == null) return 'HOLDING';
  if (pressure >= 25) return 'DISTRIBUTING';
  if (pressure <= -20) return 'ACCUMULATING';
  return 'HOLDING';
}

function insiderWhy(t) {
  const parts = [];
  parts.push(t.cohortSize + ' wallets entered in the last ' + RECENT_WINDOW_HOURS + 'h');
  if (t.cohortPressure != null) {
    const net = t.cohortNetUsd;
    parts.push(net >= 0
      ? 'net ' + formatUsd(net) + ' sold'
      : 'net ' + formatUsd(-net) + ' added');
  }
  if (t.lead && t.lead.soldPct != null) {
    parts.push('lead wallet sold ' + t.lead.soldPct + '% of sampled position');
  }
  return parts.slice(0, 3).join(' · ') + '.';
}

function formatUsd(value) {
  const abs = Math.abs(value);
  if (abs >= 1e6) return '$' + (value / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return '$' + Math.round(value / 1e3) + 'K';
  return '$' + Math.round(value);
}

function buildMeta(count, coverage) {
  return {
    count,
    source: dataProvider + '+dexscreener',
    fetchedAt: new Date().toISOString(),
    coverage,
    askTarget: '/ask-aladdin?q=' + encodeURIComponent('Is linked supply accumulating or distributing?'),
  };
}

async function buildInsiderResponse(limit) {
  const cacheKey = 'insiders:' + limit;

  const leaders = await fetchVolumeLeaders();
  if (leaders.length === 0) {
    const empty = { data: [], meta: buildMeta(0, 'No candidate tokens were available for insider screening.') };
    cache.set(cacheKey, { data: empty, ts: Date.now() });
    return empty;
  }

  const pairsByMint = await fetchPairsByMint(leaders.map(function (t) { return t.mint; }));

  const pool = [];
  for (const leader of leaders) {
    const pairs = pairsByMint.get(leader.mint);
    if (!pairs || pairs.length === 0) continue;
    const market = pickMarket(pairs);
    if (market.volume24h <= 0 && market.marketCapUsd <= 0) continue;
    const ageDays = ageDaysFrom(market.launchedAt);
    if (ageDays == null || ageDays > INSIDER_MAX_AGE_DAYS) continue;
    if (market.marketCapUsd < MC_MIN || market.liquidityUsd < LIQ_MIN) continue;
    pool.push({
      mint: leader.mint,
      symbol: market.symbol || leader.symbol || leader.mint.slice(0, 6).toUpperCase(),
      name: market.name || leader.name || 'Unknown',
      ageDays,
      launchedAt: market.launchedAt,
      mc: market.marketCapUsd,
      liquidity: market.liquidityUsd,
      volume24h: market.volume24h,
      change: market.change24h,
      imageUrl: market.imageUrl,
      volume7d: leader.volume7d,
    });
  }

  if (pool.length === 0) {
    const empty = { data: [], meta: buildMeta(0, 'No recently launched tokens matched the current thresholds.') };
    cache.set(cacheKey, { data: empty, ts: Date.now() });
    return empty;
  }

  pool.sort(function (a, b) { return b.volume24h - a.volume24h; });
  const scanned = pool.slice(0, SCAN_COUNT);

  const recentRows = await fetchRecentTrades(scanned.map(function (t) { return t.mint; }));
  const recentLegs = recentLegsByWalletMint(recentRows);
  const buyersByMint = recentBuyerCount(recentRows);
  const lastPrice = lastPriceByMint(recentRows);

  const rows = [];
  for (const t of scanned) {
    const cohort = [];
    for (const legs of recentLegs.values()) {
      if (legs.mint !== t.mint) continue;
      if (legs.buyQty <= 0 || legs.minTimeSide !== 'buy') continue;

      const avgSold = legs.buyQty > 0 ? Math.min(Math.round((legs.sellQty / legs.buyQty) * 100), 100) : null;
      const remainingQty = Math.max(legs.buyQty - legs.sellQty, 0);
      const remainingUsd = remainingQty > 0 && lastPrice.has(t.mint)
        ? Math.round(remainingQty * lastPrice.get(t.mint))
        : 0;
      let realized = 0;
      if (legs.buyQty > 0 && legs.sellQty > 0) {
        const avgBuy = legs.buyUsd / legs.buyQty;
        const avgSell = legs.sellUsd / legs.sellQty;
        realized = Math.round(Math.min(legs.buyQty, legs.sellQty) * (avgSell - avgBuy));
      }
      cohort.push({
        wallet: legs.wallet,
        firstTime: legs.minTime,
        boughtUsd: legs.minTimeUsd,
        buyUsd: legs.buyUsd,
        sellUsd: legs.sellUsd,
        avgSold,
        realized,
        remainingUsd,
      });
    }

    if (cohort.length === 0) continue;

    const totalBuy = cohort.reduce(function (s, w) { return s + w.buyUsd; }, 0);
    const totalSell = cohort.reduce(function (s, w) { return s + w.sellUsd; }, 0);
    const net = totalSell - totalBuy;
    const pressure = totalBuy + totalSell > 0 ? ((totalSell - totalBuy) / (totalBuy + totalSell)) * 100 : null;
    const soldRatios = cohort.map(function (w) { return w.avgSold; }).filter(function (v) { return v != null; });
    const avgSold = soldRatios.length > 0
      ? Math.round(soldRatios.reduce(function (a, b) { return a + b; }, 0) / soldRatios.length)
      : null;

    cohort.sort(function (a, b) { return b.boughtUsd - a.boughtUsd; });
    const lead = cohort[0];
    const entryMin = lead.firstTime != null
      ? Math.max(Math.round((Date.now() - lead.firstTime) / 60000), 1)
      : null;

    const stage = insiderStage(pressure, avgSold);
    const isChanged = (pressure != null && Math.abs(pressure) >= 25) || (avgSold != null && avgSold >= 60);
    const signal = pressure != null && Math.abs(pressure) >= 45;

    const token = {
      id: shortAddress(t.mint),
      mint: t.mint,
      symbol: t.symbol,
      name: t.name,
      imageUrl: t.imageUrl,
      color: generateColor(t.mint),
      stage,
      signal,
      buyers: buyersByMint.get(t.mint) || 0,
      cohortSize: cohort.length,
      cohortPressure: pressure != null ? Math.round(pressure) : null,
      cohortNetUsd: Math.round(net),
      cohortAvgSold: avgSold,
      lead: {
        id: shortAddress(lead.wallet),
        address: lead.wallet,
        entryMin,
        boughtUsd: Math.round(lead.boughtUsd),
        soldPct: lead.avgSold,
        realizedPnl: lead.realized,
        remainingUsd: lead.remainingUsd,
      },
      isNew: t.ageDays <= 7,
      isChanged,
      highSignal: signal,
      mc: t.mc,
      change: t.change,
      liquidity: t.liquidity,
      volume: t.volume24h,
      ageDays: t.ageDays,
      why: '',
    };
    token.why = insiderWhy(token);
    rows.push(token);
  }

  // Strongest systematic redistribution first, then participation size.
  rows.sort(function (a, b) {
    const ap = a.cohortPressure != null ? Math.abs(a.cohortPressure) : 0;
    const bp = b.cohortPressure != null ? Math.abs(b.cohortPressure) : 0;
    return bp - ap || (a.cohortSize - b.cohortSize) || b.volume - a.volume;
  });
  const selected = rows.slice(0, limit);

  const coverage = 'Early-entry wallets are the cohort whose sampled history in the last ' + RECENT_WINDOW_HOURS + 'h (Bitquery keeps up to three '
    + 'recent legs per wallet) starts with a buy — a visible recent entry rather than a verified pair-launch event. Redistribution measures cohort '
    + 'sell ratio and net sell/buy flow over the sampled window, with realised PnL bounded by average-cost entry. '
    + 'Funding linkage is not verified, so "linked" here means early-window timing only; relationship evidence is not '
    + 'proof of insider ownership or coordination.';

  const response = { data: selected, meta: buildMeta(selected.length, coverage) };
  cache.set(cacheKey, { data: response, ts: Date.now() });
  return response;
}

// One build per cache key at a time: warm refresh and inbound requests share
// the same provider scan instead of doubling concurrent query load.
function buildOrJoin(limit) {
  const cacheKey = 'insiders:' + limit;
  const existing = inflight.get(cacheKey);
  if (existing) return existing;
  const pending = buildInsiderResponse(limit);
  inflight.set(cacheKey, pending);
  pending.finally(function () { inflight.delete(cacheKey); }).catch(function () { /* swallowed by caller */ });
  return pending;
}

export async function getInsiderController(req, res, next) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 30);
  try {
    const cached = cache.get('insiders:' + limit);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return res.json(cached.data);
    }

    return res.json(await buildOrJoin(limit));
  } catch (exc) {
    const stale = cache.get('insiders:' + limit);
    if (stale && stale.data && stale.data.data) {
      return res.json(stale.data);
    }
    if (isQuotaError(exc)) {
      return res.status(503).json({
        error: 'provider_quota',
        message: 'Live insider screening is temporarily unavailable. Please try again in a few minutes.',
      });
    }
    return next(exc);
  }
}

async function refreshDefaultCache() {
  try {
    await buildOrJoin(20);
  } catch (err) {
    console.error('[insider] cache refresh failed:', err.message);
  }
}
setTimeout(refreshDefaultCache, 12000);
setInterval(refreshDefaultCache, 119_000);