import { provider as dataProvider } from '../../providers/index.js';
import dl from '../../providers/dataLayer.js';

// Candidate pool: top tokens by 7d volume, then market-quality thresholds.
const CANDIDATE_LIMIT = 200;
const OG_MC_MIN = 250_000;
const OG_LIQ_MIN = 25_000;
const MIN_AGE_DAYS = 3;
const ESTABLISHED_AGE_DAYS = 14;

const DEX_BATCH = { feed: 'og' };

// Provider queries flow through the data layer: budget gate, token bucket,
// circuit breaker and retry/backoff are all handled there. Errors are
// thrown upward so the dl.fetch wrapper can serve stale or { unavailable }.
async function dlBq(query, label) {
  const res = await dl.bitquery(query, label, { feed: 'og', priority: 'user' });
  if (res.error) throw new Error(res.error);
  return res;
}

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

function ageDaysFrom(timestamp) {
  if (!timestamp) return null;
  const ms = Date.now() - new Date(timestamp).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}

function classifyEstablished({ mc, liquidity, volume24h, top10, change }) {
  const liqRatio = mc > 0 ? liquidity / mc : 0;
  const turnover = mc > 0 ? volume24h / mc : 0;
  if (turnover >= 0.15) return 'ACTIVE ROTATION';
  if (liqRatio >= 0.10) return 'DEEP LIQUIDITY';
  if (top10 >= 85) return 'CONCENTRATED HOLDINGS';
  if (change != null && change <= -10) return 'DISTRIBUTION';
  if (change != null && change >= 10) return 'EXPANSION';
  return 'MATURE ACCUMULATION';
}

function behaviouralChangeText({ mc, volume24h, change, buyers }) {
  const turnover = mc > 0 ? volume24h / mc : 0;
  const turn = turnover.toFixed(2) + 'x market-cap turnover';
  const flow = buyers > 0 ? buyers.toLocaleString('en-US') + ' unique buyers' : 'no buyer snapshot';
  if (change == null) return 'Range-bound positioning: no 24h change on record, ' + turn + '.';
  const signed = (change > 0 ? '+' : '') + change.toFixed(1) + '%';
  if (change >= 5) return 'Participation expanding: ' + signed + ' in 24h on ' + turn + '.';
  if (change <= -5) return 'Distribution pressure: ' + signed + ' in 24h on ' + turn + '.';
  return 'Range-bound positioning: ' + signed + ' in 24h on ' + turn + ' with ' + flow + '.';
}

function whyItMattersText({ mc, liquidity, top10, buyers }) {
  const liqRatio = mc > 0 ? liquidity / mc : 0;
  const pct = Math.round(liqRatio * 100);
  const depth = liqRatio >= 0.15
    ? 'Deep liquidity at ' + pct + '% of market cap'
    : liqRatio >= 0.05
      ? 'Moderate depth at ' + pct + '% of market cap'
      : 'Thin liquidity at ' + pct + '% of market cap';
  const concentration = top10 >= 40
    ? 'top-10 concentration is high'
    : top10 >= 20
      ? 'top-10 concentration is moderate'
      : 'supply is widely distributed';
  const flow = buyers > 0
    ? buyers.toLocaleString('en-US') + ' unique buyers in 24h'
    : 'buyer counts unavailable';
  return depth + '; ' + concentration + ' (' + top10 + '%); ' + flow + '.';
}

// Volume ranking over a 7d window: enough history to surface tokens that
// have been trading for weeks or months, not just today's launches.
async function fetchVolumeLeaders() {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const query = '{\n'
    + '      Solana {\n'
    + '        trades: DEXTradeByTokens(\n'
    + '          limitBy: { by: Trade_Currency_MintAddress, count: 1 }\n'
    + '          limit: { count: ' + CANDIDATE_LIMIT + ' }\n'
    + '          orderBy: { descendingByField: "VolumeInUSD" }\n'
    + '          where: {\n'
    + '            Trade: { Currency: { MintAddress: { endsWith: "pump" } } }\n'
    + '            Transaction: { Result: { Success: true } }\n'
    + '            Block: { Time: { since: "' + since + '" } }\n'
    + '          }\n'
    + '        ) {\n'
    + '          VolumeInUSD: sum(of: Trade_Side_AmountInUSD)\n'
    + '          Trade { Currency { MintAddress Name Symbol } }\n'
    + '        }\n'
    + '      }\n'
    + '    }';

  const { data } = await dlBq(query, ':og:leaders');
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

// Keep every pair per mint so age comes from the oldest pool (token launch)
// and market metrics from the deepest pool. Routed through dl.dexBatch so
// DexScreener traffic honors the budget bucket / breaker like provider calls.
async function fetchPairsByMint(mints) {
  const res = await dl.dexBatch(mints, DEX_BATCH);
  if (res.error) throw new Error(res.error);
  const pairsByMint = new Map();
  for (const mint of mints) {
    const pairs = (res[mint] || []).filter(p => p && p.baseToken && p.baseToken.address === mint);
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
  return {
    launchedAt: launches.length ? new Date(launches[0]).toISOString() : null,
    symbol: best && best.baseToken && best.baseToken.symbol,
    name: best && best.baseToken && best.baseToken.name,
    marketCapUsd: best ? (best.marketCap != null ? Number(best.marketCap) : (best.fdv != null ? Number(best.fdv) : 0)) : 0,
    liquidityUsd: best && best.liquidity && best.liquidity.usd != null ? Number(best.liquidity.usd) : 0,
    volume24h: best && best.volume && best.volume.h24 != null ? Number(best.volume.h24) : null,
    change24h: best && best.priceChange && best.priceChange.h24 != null ? Number(best.priceChange.h24) : null,
    imageUrl: best && best.info && best.info.imageUrl ? best.info.imageUrl : null,
  };
}

// Two provider calls for the shortlist, run in parallel: latest balance per
// account (holder count + top-10 share) and distinct 24h buyers. limitBy
// keeps one row per account so counts are not diluted by churn, and one
// window per subject keeps the whole shortlist to a single round-trip.
async function fetchOwnershipAndBuyers(mints) {
  const result = { holders: new Map(), top10: new Map(), buyers: new Map(), error: null };
  if (mints.length === 0) return result;

  const quoted = mints.map(function (m) { return '"' + m + '"'; }).join(', ');
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const holdersQuery = `{
    Solana {
      BalanceUpdates(
        limitBy: { by: [BalanceUpdate_Currency_MintAddress, BalanceUpdate_Account_Address], count: 1 }
        limit: { count: 40000 }
        orderBy: { descending: Block_Slot }
        where: {
          BalanceUpdate: { Currency: { MintAddress: { in: [${quoted}] } } }
          Transaction: { Result: { Success: true } }
        }
      ) {
        BalanceUpdate { Currency { MintAddress } Account { Address } PostBalance }
      }
    }
  }`;

  const buysQuery = `{
    Solana {
      DEXTradeByTokens(
        limitBy: { by: [Trade_Currency_MintAddress, Trade_Account_Address], count: 1 }
        limit: { count: 20000 }
        orderBy: { descending: Block_Time }
        where: {
          Trade: {
            Currency: { MintAddress: { in: [${quoted}] } }
            Side: { Type: { is: buy } }
            Amount: { gt: "0" }
          }
          Transaction: { Result: { Success: true } }
          Block: { Time: { since: "${since24h}" } }
        }
      ) {
        Trade { Currency { MintAddress } Account { Address } }
      }
    }
  }`;

  const pair = await Promise.allSettled([
    dlBq(holdersQuery, ':og:holders'),
    dlBq(buysQuery, ':og:buyers'),
  ]);
  const holdersRes = { error: pair[0].status === 'fulfilled' ? null : pair[0].reason.message, data: pair[0].status === 'fulfilled' ? pair[0].value.data : null };
  const buysRes = { error: pair[1].status === 'fulfilled' ? null : pair[1].reason.message, data: pair[1].status === 'fulfilled' ? pair[1].value.data : null };

  if (holdersRes.error) {
    result.error = holdersRes.error;
  } else {
    const balancesByMint = new Map();
    for (const row of (holdersRes.data && holdersRes.data.Solana && holdersRes.data.Solana.BalanceUpdates) || []) {
      const update = row.BalanceUpdate || {};
      const mint = update.Currency && update.Currency.MintAddress;
      const addr = update.Account && update.Account.Address;
      const bal = parseFloat(update.PostBalance) || 0;
      if (!mint || !addr || bal <= 0) continue;
      if (!balancesByMint.has(mint)) balancesByMint.set(mint, new Map());
      balancesByMint.get(mint).set(addr, bal);
    }
    for (const [mint, balances] of balancesByMint) {
      const values = Array.from(balances.values()).sort(function (a, b) { return b - a; });
      const total = values.reduce(function (s, v) { return s + v; }, 0);
      const top10Sum = values.slice(0, 10).reduce(function (s, v) { return s + v; }, 0);
      result.holders.set(mint, values.length);
      result.top10.set(mint, total > 0 ? Math.round((top10Sum / total) * 1000) / 10 : 0);
    }
  }

  if (buysRes.error) {
    result.error = result.error || buysRes.error;
  } else {
    const buyerSets = new Map();
    for (const row of (buysRes.data && buysRes.data.Solana && buysRes.data.Solana.DEXTradeByTokens) || []) {
      const trade = row.Trade || {};
      const mint = trade.Currency && trade.Currency.MintAddress;
      const addr = trade.Account && trade.Account.Address;
      if (!mint || !addr) continue;
      if (!buyerSets.has(mint)) buyerSets.set(mint, new Set());
      buyerSets.get(mint).add(addr);
    }
    for (const [mint, wallets] of buyerSets) result.buyers.set(mint, wallets.size);
  }

  return result;
}

function buildMeta(count, coverage) {
  return {
    count,
    source: dataProvider + '+dexscreener',
    fetchedAt: new Date().toISOString(),
    coverage,
    askTarget: '/ask-aladdin?q=' + encodeURIComponent('How does on-chain positioning relate to mature market structure?'),
  };
}

async function buildOgResponse(limit) {
  const leaders = await fetchVolumeLeaders();
  if (leaders.length === 0) {
    return { data: [], meta: buildMeta(0, 'No established tokens matched the current market thresholds.') };
  }

  const pairsByMint = await fetchPairsByMint(leaders.map(function (t) { return t.mint; }));

  const pool = [];
  for (const leader of leaders) {
    const pairs = pairsByMint.get(leader.mint);
    if (!pairs || pairs.length === 0) continue;
    const market = pickMarket(pairs);
    const age = ageDaysFrom(market.launchedAt);
    if (age == null || age < MIN_AGE_DAYS) continue;
    if (market.marketCapUsd < OG_MC_MIN || market.liquidityUsd < OG_LIQ_MIN) continue;
    pool.push({
      mint: leader.mint,
      symbol: market.symbol || leader.symbol || leader.mint.slice(0, 6).toUpperCase(),
      name: market.name || leader.name || 'Unknown',
      ageDays: age,
      mc: market.marketCapUsd,
      liquidity: market.liquidityUsd,
      volume24h: market.volume24h != null ? market.volume24h : 0,
      change: market.change24h,
      imageUrl: market.imageUrl,
      volume7d: leader.volume7d,
    });
  }

  // Established tokens lead, but keep a slice of recently launched tokens
  // so the New filter has rows to show; backfill if either side runs short.
  const established = pool
    .filter(function (t) { return t.ageDays >= ESTABLISHED_AGE_DAYS; })
    .sort(function (a, b) { return b.mc - a.mc; });
  const young = pool
    .filter(function (t) { return t.ageDays < ESTABLISHED_AGE_DAYS; })
    .sort(function (a, b) { return b.mc - a.mc; });
  const newQuota = Math.min(Math.max(Math.round(limit * 0.3), 2), limit);
  const selected = established.slice(0, limit - newQuota).concat(young.slice(0, newQuota));
  const leftovers = established.slice(Math.max(limit - newQuota, 0)).concat(young.slice(newQuota));
  for (const extra of leftovers) {
    if (selected.length >= limit) break;
    selected.push(extra);
  }
  selected.sort(function (a, b) { return b.mc - a.mc; });
  if (selected.length === 0) {
    return { data: [], meta: buildMeta(0, 'No established tokens matched the current market thresholds.') };
  }

  const ownership = await fetchOwnershipAndBuyers(selected.map(function (t) { return t.mint; }));

  const rows = selected.map(function (t) {
    const holders = ownership.holders.has(t.mint) ? ownership.holders.get(t.mint) : 0;
    const top10 = ownership.top10.has(t.mint) ? ownership.top10.get(t.mint) : 0;
    const buyers = ownership.buyers.has(t.mint) ? ownership.buyers.get(t.mint) : 0;
    const change = t.change;
    const turnover = t.mc > 0 ? t.volume24h / t.mc : 0;
    const isChanged = (change != null && Math.abs(change) >= 5) || turnover >= 0.3;
    const highSignal = change != null
      && ((Math.abs(change) >= 10 && t.volume24h >= 100000) || turnover >= 0.3);
    const metrics = {
      mc: t.mc,
      liquidity: t.liquidity,
      volume24h: t.volume24h,
      change: change,
      top10: top10,
      buyers: buyers,
    };
    return {
      id: t.mint.slice(0, 8),
      mint: t.mint,
      symbol: t.symbol,
      name: t.name,
      imageUrl: t.imageUrl,
      color: generateColor(t.mint),
      formation: classifyEstablished(metrics),
      buyers: buyers,
      mc: t.mc,
      change: change,
      liquidity: t.liquidity,
      volume: t.volume24h,
      holders: holders,
      top10: top10,
      ageDays: t.ageDays,
      isNew: t.ageDays < ESTABLISHED_AGE_DAYS,
      isChanged: isChanged,
      highSignal: highSignal,
      behaviouralChange: behaviouralChangeText(metrics),
      whyItMatters: whyItMattersText(metrics),
    };
  });

  const coverage = ownership.error
    ? 'Market data live; holder and buyer metrics temporarily unavailable.'
    : 'Market cap, liquidity, 24h volume, 24h change and imagery from DexScreener. Token age from earliest indexed pool. Buyers, holder counts and top-10 concentration from on-chain balances (24h window).';

  return { data: rows, meta: buildMeta(rows.length, coverage) };
}

export async function getOgController(req, res, next) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 30);
  try {
    const out = await dl.fetch({
      key: 'og:' + limit,
      feed: 'og',
      priority: 'user',
      request: () => buildOgResponse(limit),
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
    console.error('[og] handler error:', exc && exc.message ? exc.message : exc);
    return res.status(502).json({
      error: 'upstream_unavailable',
      message: 'Live market data is temporarily unavailable. Please try again in a few minutes.',
    });
  }
}