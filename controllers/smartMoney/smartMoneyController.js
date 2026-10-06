import { graphql as providerGraphql, provider as dataProvider } from '../../providers/index.js';

const cache = new Map();
const inflight = new Map();
const CACHE_TTL = 120_000;

const LEADER_LIMIT = 30;
const WINDOW_HOURS = 48;
const GROUP_SIZE = 10;
const ROW_LIMIT_PER_GROUP = 50000;
const MAX_TRADE_GROUPS = 3;

// AMM/quote system accounts that appear as trade parties but are not wallets
// a user could hold positions from as an individual.
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

function generateColor(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

function shortAddress(address) {
  return String(address || '').slice(0, 6);
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

function sinceIso(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

// Top traded meme tokens over 7d: enough history that winner wallets have
// had time to build and defend positions.
async function fetchVolumeLeaders() {
  const since7d = sinceIso(24 * 7);
  const query = `{
    Solana {
      trades: DEXTradeByTokens(
        limitBy: { by: Trade_Currency_MintAddress, count: 1 }
        limit: { count: ${LEADER_LIMIT} }
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

  const { error, data } = await gqlWithRetry(query, ':sm:leaders');
  if (error) throw new Error(error);

  const leaders = [];
  const seen = new Set();
  for (const row of (data && data.Solana && data.Solana.trades) || []) {
    const currency = row.Trade && row.Trade.Currency;
    const mint = currency && currency.MintAddress;
    if (!mint || seen.has(mint)) continue;
    seen.add(mint);
    leaders.push({
      mint,
      name: currency.Name || '',
      symbol: currency.Symbol || '',
      volume7d: parseFloat(row.VolumeInUSD) || 0,
    });
  }
  return leaders;
}

// Every token's earliest known trade, used to score how early a wallet got in.
async function fetchFirstTrades(mints) {
  const map = new Map();
  if (mints.length === 0) return map;
  const quoted = mints.map(function (m) { return '"' + m + '"'; }).join(', ');

  const query = `{
    Solana {
      DEXTradeByTokens(
        limitBy: { by: Trade_Currency_MintAddress, count: 1 }
        limit: { count: ${mints.length} }
        orderBy: { ascending: Block_Time }
        where: {
          Trade: { Currency: { MintAddress: { in: [${quoted}] } } }
          Transaction: { Result: { Success: true } }
        }
      ) {
        Block { Time }
        Trade { Currency { MintAddress } }
      }
    }
  }`;

  const { error, data } = await gqlWithRetry(query, ':sm:firstTrades');
  if (error) throw new Error(error);

  for (const row of (data && data.Solana && data.Solana.DEXTradeByTokens) || []) {
    const mint = row.Trade && row.Trade.Currency && row.Trade.Currency.MintAddress;
    if (mint && row.Block && row.Block.Time) map.set(mint, row.Block.Time);
  }
  return map;
}

// Sampled recent legs per (mint, account): limitBy keeps a bounded number of
// rows per token-account so quieter tokens are not drowned out by the hottest
// mint, and the trader identity comes from the fee payer (the real wallet).
async function fetchTradeRows(mints) {
  if (mints.length === 0) return [];
  const since = sinceIso(WINDOW_HOURS);
  const groups = [];
  for (let i = 0; i < mints.length; i += GROUP_SIZE) groups.push(mints.slice(i, i + GROUP_SIZE));

  const queries = groups.slice(0, MAX_TRADE_GROUPS).map((group, idx) => {
    const quoted = group.map(function (m) { return '"' + m + '"'; }).join(', ');
    const query = `{
      Solana {
        DEXTradeByTokens(
          limitBy: { by: [Trade_Currency_MintAddress, Trade_Account_Address], count: 3 }
          limit: { count: ${ROW_LIMIT_PER_GROUP} }
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
    return gqlWithRetry(query, ':sm:trades:' + (idx + 1)).then(function (res) {
      if (res.error) throw new Error(res.error);
      return (res.data && res.data.Solana && res.data.Solana.DEXTradeByTokens) || [];
    });
  });

  const batches = await Promise.all(queries);
  return batches.flat();
}

function roundCurrency(value) {
  return Math.round(value);
}

function entryStageLabel(entryAgeH) {
  if (entryAgeH == null) return '—';
  if (entryAgeH < 0.5) return 'Launch (<30m)';
  if (entryAgeH < 3) return 'Early (<3h)';
  if (entryAgeH < 12) return 'Discovery (3–12h)';
  if (entryAgeH < 48) return 'Mid (12–48h)';
  return 'Late (>48h)';
}

function labelWallet(w) {
  let primary = 'Proven Trader';
  let secondary = 'Recent-window breakout';

  if (w.sample >= 8 && w.winRate != null && w.winRate >= 60 && w.computable >= 5) {
    primary = 'Smart Money';
  } else if (w.computable >= 2 && w.winRate != null && w.winRate >= 60) {
    primary = 'Proven Trader';
  } else if (w.entryAgeH != null && w.entryAgeH < 1 && w.sample >= 3) {
    primary = 'Migration Specialist';
  } else if (w.openCount >= 2 && w.avgSold <= 40) {
    primary = 'Accumulator';
  } else if (w.sample >= 6) {
    primary = 'Rotation Trader';
  } else if (w.winRate != null && w.winRate >= 50) {
    primary = 'Proven Trader';
  } else {
    primary = 'Active Trader';
  }

  if (w.entryAgeH != null) {
    secondary = w.entryAgeH < 1 ? 'Early entries' : w.entryAgeH < 6 ? 'Discovery entries' : 'Mid-cycle entries';
  }
  if (w.openCount > 0) secondary += ' · ' + w.openCount + ' open';
  return { primary, secondary };
}

function buildMeta(count, coverage, error) {
  return {
    count,
    source: dataProvider,
    fetchedAt: new Date().toISOString(),
    coverage,
    error,
    askTarget: '/ask-aladdin?q=' + encodeURIComponent('Where are proven wallets positioning now?'),
  };
}

async function buildSmartMoneyResponse(limit) {
  const cacheKey = 'smart-money:' + limit;

  try {
    const leaders = await fetchVolumeLeaders();
    if (leaders.length === 0) {
      const empty = { data: [], meta: buildMeta(0, 'No candidate tokens were available for wallet scoring.') };
      cache.set(cacheKey, { data: empty, ts: Date.now() });
      return empty;
    }

    const mints = leaders.map(function (t) { return t.mint; });
    const [firstTrades, tradeRows] = await Promise.all([
      fetchFirstTrades(mints),
      fetchTradeRows(mints),
    ]);

    const symbolByMint = new Map(leaders.map(function (t) { return [t.mint, t.symbol]; }));

    // Latest price per mint from the sampled legs.
    const lastPrice = new Map();
    for (const row of tradeRows) {
      const mint = row.Trade && row.Trade.Currency && row.Trade.Currency.MintAddress;
      const price = row.Trade && parseFloat(row.Trade.PriceInUSD);
      if (mint && Number.isFinite(price) && price > 0) lastPrice.set(mint, price);
    }

    // Per wallet, per mint: aggregate sampled buy/sell legs.
    const byWallet = new Map();
    for (const row of tradeRows) {
      const trade = row.Trade || {};
      const mint = trade.Currency && trade.Currency.MintAddress;
      const wallet = row.Transaction && row.Transaction.FeePayer;
      const side = trade.Side && trade.Side.Type;
      const qty = parseFloat(trade.Amount) || 0;
      const usd = parseFloat(trade.AmountInUSD) || 0;
      if (!mint || !wallet || ROUTER_WALLETS.has(wallet)) continue;
      if (!['buy', 'sell'].includes(side) || qty <= 0) continue;

      if (!byWallet.has(wallet)) byWallet.set(wallet, new Map());
      const tokens = byWallet.get(wallet);
      if (!tokens.has(mint)) {
        tokens.set(mint, { buyQty: 0, buyUsd: 0, sellQty: 0, sellUsd: 0, firstBuy: null });
      }
      const legs = tokens.get(mint);
      if (side === 'buy') {
        legs.buyQty += qty;
        legs.buyUsd += usd;
        if (!legs.firstBuy || row.Block.Time < legs.firstBuy) legs.firstBuy = row.Block.Time;
      } else {
        legs.sellQty += qty;
        legs.sellUsd += usd;
      }
    }

    const wallets = [];
    for (const [wallet, tokens] of byWallet) {
      let realized = 0;
      let wins = 0;
      let computable = 0;
      let openUsd = 0;
      let openCount = 0;
      let remainingSum = 0;
      let boughtTokens = 0;
      const soldRatios = [];
      let earliestAgeH = null;
      let earliestSymbol = '';
      const topPositions = [];

      for (const [mint, legs] of tokens) {
        const first = firstTrades.get(mint);
        const lastP = lastPrice.get(mint) || 0;

        if (legs.firstBuy && first) {
          const ageH = (new Date(legs.firstBuy).getTime() - new Date(first).getTime()) / 36e5;
          if (earliestAgeH == null || ageH < earliestAgeH) {
            earliestAgeH = ageH;
            earliestSymbol = symbolByMint.get(mint) || shortAddress(mint);
          }
        }

        if (legs.buyQty <= 0) continue;
        const avgBuy = legs.buyUsd / legs.buyQty;
        const avgSell = legs.sellQty > 0 ? legs.sellUsd / legs.sellQty : 0;
        const matched = Math.min(legs.buyQty, legs.sellQty);
        const pnl = matched * (avgSell - avgBuy);
        const remainingQty = Math.max(legs.buyQty - legs.sellQty, 0);

        soldRatios.push(legs.sellQty / legs.buyQty);
        boughtTokens++;
        remainingSum += legs.buyQty > 0 ? Math.max(legs.buyQty - legs.sellQty, 0) / legs.buyQty : 0;

        if (legs.sellQty > 0) {
          computable++;
          realized += pnl;
          if (pnl > 0) wins++;
        }
        if (remainingQty > 0 && lastP > 0) {
          openUsd += remainingQty * lastP;
          openCount++;
        }
        if (legs.sellQty > 0 || (remainingQty > 0 && lastP > 0)) {
          topPositions.push({
            symbol: symbolByMint.get(mint) || shortAddress(mint),
            realized: roundCurrency(pnl),
            remainingPct: Math.round(Math.max(legs.buyQty - legs.sellQty, 0) / legs.buyQty * 100),
            openUsd: roundCurrency(remainingQty * lastP),
          });
        }
      }

      if (computable === 0) continue;

      const sample = tokens.size;
      const winRate = Math.round((wins / computable) * 100);
      const avgSold = soldRatios.length ? Math.round((soldRatios.reduce(function (a, b) { return a + b; }, 0) / soldRatios.length) * 100) : 100;
      const holdingPct = boughtTokens > 0 ? Math.round((remainingSum / boughtTokens) * 100) : 0;

      wallets.push({
        address: wallet,
        realized: roundCurrency(realized),
        wins,
        computable,
        sample,
        winRate,
        openUsd: roundCurrency(openUsd),
        openCount,
        avgSold,
        holdingPct,
        entryAgeH: earliestAgeH,
        entrySymbol: earliestSymbol,
        repeatable: sample >= 2,
        topPositions: topPositions.sort(function (a, b) { return b.openUsd - a.openUsd || b.realized - a.realized; }).slice(0, 3),
      });
    }

    wallets.sort(function (a, b) { return b.realized - a.realized || b.sample - a.sample; });

    const selected = wallets
      .filter(function (w) { return w.realized >= 50 || w.openUsd >= 300; })
      .slice(0, limit);

    const resultRows = selected.map(function (w) {
      const label = labelWallet(w);
      return {
        id: shortAddress(w.address),
        address: w.address,
        color: generateColor(w.address),
        behaviour: label.primary,
        secondary: label.secondary,
        realizedPnl: w.realized,
        winRate: w.winRate,
        sampleTokens: w.sample,
        computableTokens: w.computable,
        entryStage: {
          label: entryStageLabel(w.entryAgeH),
          token: w.entrySymbol || '—',
        },
        openUsd: w.openUsd,
        openCount: w.openCount,
        holdingPct: w.holdingPct,
        repeatable: w.repeatable,
        topTokens: w.topPositions,
      };
    });

    const coverage = 'Derived from the last 48h of sampled DEX trades across the top traded Solana meme tokens. '
      + 'Realized PnL uses average-cost on buy/sell legs observed inside the sample; win rate, entry timing and holdings cover the same window. '
      + 'Labels describe observed recent behaviour, not permanent identity.';

    const response = { data: resultRows, meta: buildMeta(resultRows.length, coverage) };
    cache.set(cacheKey, { data: response, ts: Date.now() });
    return response;
  } catch (exc) {
    throw exc;
  }
}

// One build per cache key at a time: a warm refresh and an inbound request
// are the same provider scan, so join the running build instead of doubling
// the concurrent query load (Bitquery restricts concurrent sessions).
function buildOrJoin(limit) {
  const cacheKey = 'smart-money:' + limit;
  const existing = inflight.get(cacheKey);
  if (existing) return existing;
  const pending = buildSmartMoneyResponse(limit);
  inflight.set(cacheKey, pending);
  pending.finally(function () { inflight.delete(cacheKey); }).catch(function () { /* swallowed by caller */ });
  return pending;
}

export async function getSmartMoneyController(req, res, next) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 30);
  try {
    const cached = cache.get('smart-money:' + limit);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return res.json(cached.data);
    }

    return res.json(await buildOrJoin(limit));
  } catch (exc) {
    // A failed refresh must not strand the last good data: serve it stale
    // when we have it, otherwise report the provider problem.
    const stale = cache.get('smart-money:' + limit);
    if (stale && stale.data && stale.data.data) {
      return res.json(stale.data);
    }
    if (isQuotaError(exc)) {
      return res.status(503).json({
        error: 'provider_quota',
        message: 'Live wallet analytics are temporarily unavailable. Please try again in a few minutes.',
      });
    }
    return next(exc);
  }
}

async function refreshDefaultCache() {
  try {
    await buildOrJoin(20);
  } catch (err) {
    console.error('[smart-money] cache refresh failed:', err.message);
  }
}
setTimeout(refreshDefaultCache, 6000);
setInterval(refreshDefaultCache, 107_000);