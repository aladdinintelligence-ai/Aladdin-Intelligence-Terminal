import { provider as dataProvider } from '../../providers/index.js';
import dl from '../../providers/dataLayer.js';

// Candidate pool: top traded meme tokens over 7d, then market-quality threshold.
const CANDIDATE_LIMIT = 200;
const MC_MIN = 5_000;
const LIQ_MIN = 1_500;
const FORMATION_MAX_AGE_DAYS = 30;

// On-chain formation metrics scan: the top of the pool by 24h volume.
const TRADE_WINDOW_HOURS = 48;
const TRADE_GROUP_SIZE = 8;
const TRADE_ROW_LIMIT = 30000;
const MAX_TRADE_GROUPS = 4;

// AMM/quote systems that appear as trade parties but are not individual wallets.
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

// Provider queries flow through the data layer: budget gate, token bucket,
// circuit breaker and retry/backoff are handled there. Errors are thrown
// upward so the dl.fetch wrapper can serve stale or { unavailable }.
async function dlBq(query, label) {
  const res = await dl.bitquery(query, label, { feed: 'formation', priority: 'user' });
  if (res.error) throw new Error(res.error);
  return res;
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

// Top traded meme tokens over 7d: freshly formed and still-forming candidates.
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

  const { data } = await dlBq(query, ':fm:leaders');

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

// Every pool token's DexScreener pairs: market metrics and the Raydium vs
// Pump.fun AMM volume split used to measure migration progress. The data
// layer batches (30/chunk), rate-limits and retries; a caller error throws.
async function fetchPairsByMint(mints) {
  const res = await dl.dexBatch(mints, { feed: 'formation' });
  if (res.error) throw new Error(res.error);
  const pairsByMint = new Map();
  for (const mint of mints) {
    const pairs = (res[mint] || []).filter(function (p) { return p && p.baseToken && p.baseToken.address === mint; });
    if (pairs.length) pairsByMint.set(mint, pairs);
  }
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

// Sampled recent legs per (mint, account) for a shortlist of mints: bounded
// rows per token-account so quieter formations are not drowned out, trader
// identity from the fee payer (the real wallet).
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
            Account { Address }
            Amount
            AmountInUSD
          }
          Transaction { FeePayer }
        }
      }
    }`;
    return dlBq(query, ':fm:trades:' + (idx + 1)).then(function (res) {
      return (res.data && res.data.Solana && res.data.Solana.DEXTradeByTokens) || [];
    });
  });

  const batches = await Promise.all(queries);
  return batches.flat();
}

// Per-mint structure: participation breadth, buyer concentration and
// profitable-wallet share from bounded average-cost round trips.
function deriveFormationMetrics(rows) {
  const byMint = new Map();

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

    if (!byMint.has(mint)) {
      byMint.set(mint, {
        buys: 0, sells: 0, buyUsd: 0, sellUsd: 0,
        buyQtyByWallet: new Map(),   // wallet -> { qty, usd, times:[] }
        sellQtyByWallet: new Map(),  // wallet -> { qty, usd }
      });
    }
    const m = byMint.get(mint);
    if (side === 'buy') {
      m.buys++;
      m.buyUsd += usd;
      if (!m.buyQtyByWallet.has(wallet)) m.buyQtyByWallet.set(wallet, { qty: 0, usd: 0, times: [] });
      const b = m.buyQtyByWallet.get(wallet);
      b.qty += qty;
      b.usd += usd;
      if (time != null) b.times.push(time);
    } else {
      m.sells++;
      m.sellUsd += usd;
      if (!m.sellQtyByWallet.has(wallet)) m.sellQtyByWallet.set(wallet, { qty: 0, usd: 0 });
      const s = m.sellQtyByWallet.get(wallet);
      s.qty += qty;
      s.usd += usd;
    }
  }

  const result = new Map();
  for (const [mint, m] of byMint) {
    const sorted = Array.from(m.buyQtyByWallet.entries()).map(function (e) {
      const wallet = e[0];
      const agg = e[1];
      const sell = m.sellQtyByWallet.get(wallet) || { qty: 0, usd: 0 };
      return { wallet, buyQty: agg.qty, buyUsd: agg.usd, sellQty: sell.qty, sellUsd: sell.usd, times: agg.times };
    }).sort(function (a, b) { return b.buyQty - a.buyQty; });
    const totalBuyQty = sorted.reduce(function (s, w) { return s + w.buyQty; }, 0);
    const top1 = totalBuyQty > 0 ? (sorted[0].buyQty / totalBuyQty) : 0;
    const top10Qty = sorted.slice(0, 10).reduce(function (s, w) { return s + w.buyQty; }, 0);
    const top10 = totalBuyQty > 0 ? (top10Qty / totalBuyQty) : 0;

    let computable = 0;
    let wins = 0;
    for (const w of sorted) {
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

    result.set(mint, {
      buyers: sorted.length,
      top1: Math.round(top1 * 100),
      top10: Math.round(top10 * 100),
      profitable,
      migration: null, // filled by market data where known
      buys: m.buys,
      sells: m.sells,
      buyUsd: Math.round(m.buyUsd),
      sellUsd: Math.round(m.sellUsd),
      sellBuy,
    });
  }
  return result;
}

function classifyFormation(m) {
  const change = m.change;
  const sellBuy = m.sellBuy;
  const top10 = m.top10;
  const migration = m.migration;

  if (sellBuy != null && sellBuy >= 1.5) return 'EXHAUSTION';
  if (change != null && change <= -40) return 'FAILED FORMATION';
  if (change != null && change <= -25 && (sellBuy == null || sellBuy >= 1.1)) return 'EXHAUSTION';
  if (migration != null && migration >= 85 && m.profitable != null && m.profitable >= 15) return 'POST-MIGRATION EXPANSION';
  if (migration != null && migration > 20 && migration < 85) return 'MIGRATION POSITIONING';
  if (migration != null && migration >= 85 && change != null && change >= 10) return 'PARTICIPATION EXPANSION';
  if (change != null && change <= -12 && top10 >= 30) return 'DISTRIBUTION';
  if (sellBuy != null && sellBuy >= 1.1 && change != null && change <= 5 && m.buyers >= 40) return 'ROTATION';
  if (change != null && change >= 15 && m.buyers >= 40 && top10 <= 60) return 'PARTICIPATION EXPANSION';
  if (m.buyers >= 40 && top10 <= 45 && m.profitable != null && m.profitable >= 10) return 'BROAD ACCUMULATION';
  if (top10 >= 45 && m.buyers >= 30) return 'CONCENTRATED ACCUMULATION';
  if (m.buyers >= 20) return 'EARLY ACCUMULATION';
  return 'DISCOVERY';
}

function formationStrength(m) {
  const buyersScale = m.maxBuyers > 0 ? m.buyers / m.maxBuyers : 0;
  const flowScale = m.maxBuyUsd > 0 ? m.buyUsd / m.maxBuyUsd : 0;
  const priceHealth = clamp((m.change != null ? m.change : 0) / 30, -1, 1);
  const sellPenalty = Math.min(Math.max((m.sellBuy != null ? m.sellBuy : 0) - 1, 0), 2) * 15;
  const top1 = m.top1 != null ? m.top1 : 0;
  const top10 = m.top10 != null ? m.top10 : 0;
  const score = Math.round(clamp(
    40 * buyersScale
      + 12 * flowScale
      + 20 * (m.profitable != null ? m.profitable / 100 : 0)
      + 10 * priceHealth
      + 10 * clamp(1 - top1 / 50, 0, 1)
      + 8 * clamp(1 - top10 / 100, 0, 1)
      - sellPenalty,
    5, 98
  ));
  return score;
}

function formationWhy(m) {
  const parts = [];
  if (m.formation === 'DISCOVERY') {
    parts.push(m.buyers + ' buyers in the last 48h, top wallet at ' + m.top1 + '% of buys');
  } else if (m.formation === 'MIGRATION POSITIONING' || m.formation === 'POST-MIGRATION EXPANSION') {
    parts.push((m.migration != null ? m.migration : 0) + '% of flow now trades on Raydium');
  }
  if (m.profitable != null) parts.push(m.profitable + '% of scored wallets in profit');
  if (m.sellBuy != null) parts.push(m.sellBuy.toFixed(2) + 'x sell/buy flow');
  if (m.top10 > 0) parts.push('top-10 ' + m.top10 + '% of buys');
  return parts.slice(0, 3).join(' · ') + '.';
}

function buildMeta(count, coverage, marketError) {
  return {
    count,
    source: marketError ? dataProvider : dataProvider + '+dexscreener',
    fetchedAt: new Date().toISOString(),
    coverage,
    askTarget: '/ask-aladdin?q=' + encodeURIComponent('Which formations show the strongest early accumulation structure?'),
  };
}

function emptyResponse(message, marketError) {
  return { data: [], meta: buildMeta(0, message, marketError) };
}

async function buildFormationResponse(limit) {
  const leaders = await fetchVolumeLeaders();
  if (leaders.length === 0) {
    return emptyResponse('No candidate tokens were available for formation scoring.', false);
  }

  // Market detail (DexScreener) is best-effort: when it fails the formation
  // metrics built from on-chain trades still stand, but the source label and
  // coverage must say so truthfully.
  let pairsByMint;
  let marketError = false;
  try {
    pairsByMint = await fetchPairsByMint(leaders.map(function (t) { return t.mint; }));
  } catch (exc) {
    console.error('[formation] DexScreener fetch failed:', exc.message);
    marketError = true;
    pairsByMint = new Map();
  }

  const pool = [];
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
      change: market.change24h,
      imageUrl: market.imageUrl,
      volume7d: leader.volume7d,
      migration: market.migration,
    });
  }

  const marketDownMessage = 'Formation metrics live from the last 48h of sampled DEX trades; market detail temporarily unavailable.';
  if (pool.length === 0) {
    return emptyResponse(
      marketError ? marketDownMessage : 'No forming tokens matched the current market thresholds.',
      marketError
    );
  }

  pool.sort(function (a, b) { return b.volume24h - a.volume24h; });
  const scanned = pool.slice(0, TRADE_GROUP_SIZE * MAX_TRADE_GROUPS);

  const rows = await fetchTradeRows(scanned.map(function (t) { return t.mint; }));
  const metrics = deriveFormationMetrics(rows);
  const maxBuyers = Math.max.apply(null, Array.from(metrics.values()).map(function (m) { return m.buyers; }).concat([1]));
  const maxBuyUsd = Math.max.apply(null, Array.from(metrics.values()).map(function (m) { return m.buyUsd; }).concat([1]));

  const scored = [];
  for (const t of scanned) {
    const m = metrics.get(t.mint);
    if (!m || m.buyers === 0) continue;
    const normalized = { ...m, migration: t.migration, change: t.change, maxBuyers, maxBuyUsd };
    const stage = classifyFormation(normalized);
    const strength = formationStrength(normalized);
    normalized.formation = stage;
    const isChanged = ['PARTICIPATION EXPANSION', 'MIGRATION POSITIONING', 'POST-MIGRATION EXPANSION', 'DISTRIBUTION', 'ROTATION'].includes(stage);
    scored.push({
      mint: t.mint,
      symbol: t.symbol,
      name: t.name,
      ageDays: t.ageDays,
      mc: t.mc,
      liquidity: t.liquidity,
      volume: t.volume24h,
      change: t.change,
      imageUrl: t.imageUrl,
      migration: t.migration,
      formation: stage,
      strength,
      buyers: m.buyers,
      top1: m.top1,
      top10: m.top10,
      profitable: m.profitable,
      buys: m.buys,
      sells: m.sells,
      buyUsd: m.buyUsd,
      sellUsd: m.sellUsd,
      sellBuy: m.sellBuy,
      isNew: t.ageDays == null || t.ageDays < 14,
      isChanged,
      why: formationWhy(normalized),
    });
  }

  scored.sort(function (a, b) { return b.strength - a.strength || b.volume - a.volume; });

  // High signal = top ~30% of today's formations by strength, excluding
  // failing/rotating states, so the filter always has a live cohort behind it.
  const signalCut = Math.ceil(scored.length * 0.3);
  const signalThreshold = scored.length > 0
    ? Math.max(55, scored[Math.min(Math.max(signalCut - 1, 0), scored.length - 1)].strength)
    : 98;
  for (const t of scored) {
    const failing = ['EXHAUSTION', 'FAILED FORMATION', 'DISTRIBUTION', 'ROTATION'].includes(t.formation);
    t.highSignal = t.strength >= signalThreshold && !failing;
  }

  const selected = scored.slice(0, limit);

  const data = selected.map(function (t) {
    return {
      id: t.mint.slice(0, 8),
      mint: t.mint,
      symbol: t.symbol,
      name: t.name,
      imageUrl: t.imageUrl,
      color: generateColor(t.mint),
      formation: t.formation,
      strength: t.strength,
      signal: t.highSignal,
      buyers: t.buyers,
      top1: t.top1,
      top10: t.top10,
      profitable: t.profitable,
      residence: t.migration,
      buys: t.buys,
      sells: t.sells,
      buyUsd: t.buyUsd,
      sellUsd: t.sellUsd,
      sellBuy: t.sellBuy,
      mc: t.mc,
      change: t.change,
      liquidity: t.liquidity,
      volume: t.volume,
      ageDays: t.ageDays,
      isNew: t.isNew,
      isChanged: t.isChanged,
      highSignal: t.highSignal,
      why: t.why,
    };
  });

  const coverage = marketError
    ? marketDownMessage
    : 'Formation stage, participation breadth, buyer concentration, share of buyers still buying in the final 12h of the sample, profitable-wallet share and sell pressure derive from 48h of sampled DEX trades on Bitquery across the top traded Solana meme tokens. Market cap, liquidity, volume, 24h change and age come from DexScreener pairs; migration share is the volume routed on mature AMMs (Raydium, Meteora) versus bonding-curve AMMs (Pump.fun, PumpSwap). Stages are heuristic labels of observed recent structure, not publisher ratings.';

  return { data, meta: buildMeta(data.length, coverage, marketError) };
}

export async function getFormationController(req, res, next) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 30);
  try {
    const out = await dl.fetch({
      key: 'formation:' + limit,
      feed: 'formation',
      priority: 'user',
      request: () => buildFormationResponse(limit),
    });

    if (out.unavailable) {
      return res.status(503).json({
        error: 'upstream_unavailable',
        message: 'Live market data is temporarily unavailable. Please try again in a few minutes.',
      });
    }

    const response = out.data;
    if (out.stale && response.meta) response.meta.stale = true;
    return res.json(response);
  } catch (exc) {
    console.error('[formation] handler error:', exc && exc.message ? exc.message : exc);
    return res.status(502).json({
      error: 'upstream_unavailable',
      message: 'Live market data is temporarily unavailable. Please try again in a few minutes.',
    });
  }
}