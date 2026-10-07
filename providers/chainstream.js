import axios from 'axios';

const PUMP_FUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// fetch* helpers route through the resilient dataLayer (see providers/bitquery.js
// for the rationale). Lazy import keeps the ESM graph acyclic.
let _dlPromise = null;
function dlBq(query, label, feed, priority) {
  if (!_dlPromise) _dlPromise = import('./dataLayer.js');
  return _dlPromise.then((m) => m.default.bitquery(query, label, { feed: feed || 'data', priority: priority || 'user' }));
}

let _baseUrl = '';
let _apiKey = '';
let _timeout = 30000;

export function initChainStreamProvider(config) {
  _baseUrl = (config.baseUrl || 'https://graphql.chainstream.io/graphql').replace(/\/+$/, '');
  _apiKey = config.apiKey || '';
  _timeout = config.timeoutMs || 30000;
}

function headers() {
  return { 'Content-Type': 'application/json', 'X-API-KEY': _apiKey };
}

export async function graphql(query, label = '') {
  if (!_apiKey) return { error: 'CHAINSTREAM_API_KEY not configured', data: null };
  try {
    const response = await axios.post(_baseUrl, { query }, { headers: headers(), timeout: _timeout });
    if (response.data?.errors) {
      const msg = response.data.errors[0]?.message || 'GraphQL error';
      console.error(`[chainstream${label ? ':' + label : ''}] GraphQL error: ${msg}`);
      return { error: msg, data: null };
    }
    return { error: null, data: response.data?.data };
  } catch (exc) {
    const detail = exc.response?.data?.errors?.[0]?.message || '';
    const msg = exc.message + (detail ? ': ' + detail : '');
    console.error(`[chainstream${label ? ':' + label : ''}] Request failed: ${msg}`);
    return { error: msg, data: null };
  }
}

function dedup(arr, keyFn) {
  const seen = new Set();
  return arr.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function gqlStr(arr) {
  return arr.map(s => '"' + s + '"').join(', ');
}

function sinceIso(hours) {
  // Defensive: a bad window (e.g. an options object in this arg position)
  // must degrade to 1h, never crash the feed with "Invalid time value".
  const h = Number(hours);
  const safeHours = Number.isFinite(h) && h > 0 ? h : 1;
  return new Date(Date.now() - safeHours * 60 * 60 * 1000).toISOString();
}

function calcBonding(basePostAmount) {
  const balance = parseFloat(basePostAmount) || 0;
  if (balance <= 0) return null;
  const bonding = 100 - ((balance - 206900000) * 100 / 793100000);
  return Math.min(100, Math.max(0, Math.round(bonding * 100) / 100));
}

// Fetch the latest DEX pool state for a set of mints, one pool per mint.
async function fetchPoolsForMints(mints, label = '', feed = 'launches') {
  const poolByMint = new Map();
  if (mints.length === 0) return poolByMint;

  const query = `{
    Solana {
      DEXPools(
        limitBy: { by: Pool_Market_BaseCurrency_MintAddress, count: 1 }
        limit: { count: ${mints.length} }
        orderBy: { descending: Block_Time }
        where: {
          Pool: { Market: { BaseCurrency: { MintAddress: { in: [${gqlStr(mints)}] } } } }
        }
      ) {
        Pool {
          Market { BaseCurrency { MintAddress Name Symbol } MarketAddress }
          Base { PostAmount PostAmountInUSD }
          Quote { PostAmount PriceInUSD PostAmountInUSD }
        }
      }
    }
  }`;

  const { error, data } = await dlBq(query, label, feed);
  if (error) return poolByMint;

  for (const p of dedup(data?.Solana?.DEXPools || [], x => x.Pool?.Market?.BaseCurrency?.MintAddress)) {
    const mint = p.Pool?.Market?.BaseCurrency?.MintAddress;
    if (mint) poolByMint.set(mint, p);
  }
  return poolByMint;
}

async function fetchVolumeForMints(mints, hours = 24, label = '', feed = 'launches') {
  const volumeByMint = new Map();
  if (mints.length === 0) return volumeByMint;

  const since = sinceIso(hours);
  const rowLimit = Math.min(Math.max(mints.length * 20, 1000), 25000);

  const volQuery = `{
    Solana {
      DEXTradeByTokens(
        limit: { count: ${rowLimit} }
        where: {
          Trade: { Currency: { MintAddress: { in: [${gqlStr(mints)}] } } }
          Block: { Time: { since: "${since}" } }
        }
      ) {
        VolumeInUSD: sum(of: Trade_AmountInUSD)
        Trade { Currency { MintAddress } }
      }
    }
  }`;

  const { error, data } = await dlBq(volQuery, label, feed);
  if (error) return volumeByMint;

  for (const v of data?.Solana?.DEXTradeByTokens || []) {
    const mint = v.Trade?.Currency?.MintAddress;
    if (mint) volumeByMint.set(mint, parseFloat(v.VolumeInUSD) || 0);
  }
  return volumeByMint;
}

async function fetchFirstTradeTimeForMints(mints, label = '', feed = 'launches') {
  const firstTradeByMint = new Map();
  if (mints.length === 0) return firstTradeByMint;

  const query = `{
    Solana {
      DEXTradeByTokens(
        limitBy: { by: Trade_Currency_MintAddress, count: 1 }
        limit: { count: ${mints.length} }
        orderBy: { ascending: Block_Time }
        where: {
          Trade: { Currency: { MintAddress: { in: [${gqlStr(mints)}] } } }
        }
      ) {
        Block { Time }
        Trade { Currency { MintAddress } }
      }
    }
  }`;

  const { error, data } = await dlBq(query, label, feed);
  if (error) return firstTradeByMint;

  for (const row of data?.Solana?.DEXTradeByTokens || []) {
    const mint = row.Trade?.Currency?.MintAddress;
    const time = row.Block?.Time;
    if (mint && time) firstTradeByMint.set(mint, time);
  }
  return firstTradeByMint;
}

// Distinct wallets holding a positive balance per mint. BalanceUpdates is a
// change-log, so we take the most recent row per (mint, account) in JS
// (rows come newest-first via Block_Slot) and count balances above zero.
async function fetchHoldersCountForMints(mints, label = '', feed = 'launches') {
  const holdersByMint = new Map();
  if (mints.length === 0) return holdersByMint;

  const rowLimit = Math.min(Math.max(mints.length * 500, 5000), 50000);

  const query = `{
    Solana {
      BalanceUpdates(
        limit: { count: ${rowLimit} }
        orderBy: { descending: Block_Slot }
        where: {
          BalanceUpdate: { Currency: { MintAddress: { in: [${gqlStr(mints)}] } } }
        }
      ) {
        BalanceUpdate {
          Currency { MintAddress }
          Account { Address }
          PostBalance
        }
      }
    }
  }`;

  const { error, data } = await dlBq(query, label, feed);
  if (error) return holdersByMint;

  const seen = new Map();
  for (const row of data?.Solana?.BalanceUpdates || []) {
    const mint = row.BalanceUpdate?.Currency?.MintAddress;
    const account = row.BalanceUpdate?.Account?.Address;
    if (!mint || !account) continue;
    const key = mint + ':' + account;
    if (seen.has(key)) continue;
    seen.set(key, parseFloat(row.BalanceUpdate?.PostBalance) || 0);
  }

  const counts = new Map();
  for (const [key, bal] of seen) {
    if (bal <= 0) continue;
    const mint = key.split(':')[0];
    counts.set(mint, (counts.get(mint) || 0) + 1);
  }
  for (const mint of mints) holdersByMint.set(mint, counts.get(mint) || 0);
  return holdersByMint;
}

async function fetchTxCountForMints(mints, label = '', feed = 'launches') {
  const txByMint = new Map();
  if (mints.length === 0) return txByMint;

  const rowLimit = Math.min(Math.max(mints.length * 50, 2000), 25000);

  const query = `{
    Solana {
      DEXTradeByTokens(
        limit: { count: ${rowLimit} }
        where: {
          Trade: { Currency: { MintAddress: { in: [${gqlStr(mints)}] } } }
        }
      ) {
        TxCount: count
        Trade { Currency { MintAddress } }
      }
    }
  }`;

  const { error, data } = await dlBq(query, label, feed);
  if (error) return txByMint;

  for (const row of data?.Solana?.DEXTradeByTokens || []) {
    const mint = row.Trade?.Currency?.MintAddress;
    if (mint) txByMint.set(mint, parseInt(row.TxCount, 10) || 0);
  }
  return txByMint;
}

export async function fetchNewTokens(limit = 50, { feed = 'launches', priority = 'user' } = {}) {
  const query = `{
    Solana {
      supply: TokenSupplyUpdates(
        limitBy: { by: TokenSupplyUpdate_Currency_MintAddress, count: 1 }
        limit: { count: ${limit} }
        orderBy: { descending: Block_Time }
        where: {
          TokenSupplyUpdate: { Currency: { MintAddress: { endsWith: "pump" } } }
        }
      ) {
        Block { Time }
        TokenSupplyUpdate { Currency { MintAddress Name Symbol } PostBalanceInUSD }
      }
      pools: DEXPools(
        limitBy: { by: Pool_Market_BaseCurrency_MintAddress, count: 1 }
        limit: { count: ${limit * 4} }
        orderBy: { descending: Block_Time }
        where: {
          Pool: {
            Dex: { ProgramAddress: { is: "${PUMP_FUN_PROGRAM}" } }
            Market: { QuoteCurrency: { MintAddress: { in: ["${SOL_MINT}", "11111111111111111111111111111111"] } } }
          }
        }
      ) {
        Pool {
          Market { BaseCurrency { MintAddress Name Symbol } MarketAddress }
          Base { PostAmount PostAmountInUSD }
          Quote { PostAmount PriceInUSD PostAmountInUSD }
        }
      }
    }
  }`;

  const { error, data } = await dlBq(query, 'fetchNewTokens', feed, priority);
  if (error) return { error, tokens: [] };

  const supply = dedup(data?.Solana?.supply || [], x => x.TokenSupplyUpdate?.Currency?.MintAddress);
  const pools = data?.Solana?.pools || [];

  const poolByMint = new Map();
  for (const p of dedup(pools, x => x.Pool?.Market?.BaseCurrency?.MintAddress)) {
    const mint = p.Pool?.Market?.BaseCurrency?.MintAddress;
    if (mint) poolByMint.set(mint, p);
  }

  const missingMints = supply
    .map(s => s.TokenSupplyUpdate?.Currency?.MintAddress)
    .filter(mint => mint && !poolByMint.has(mint));

  if (missingMints.length > 0) {
    const fallbackPools = await fetchPoolsForMints(missingMints, 'fetchNewTokens:fallback', feed);
    for (const [mint, pool] of fallbackPools) poolByMint.set(mint, pool);
  }

  const tokens = supply.map(update => {
    const c = update.TokenSupplyUpdate?.Currency;
    const mint = c?.MintAddress || '';
    const pool = poolByMint.get(mint);
    return {
      mint,
      name: c?.Name || '',
      symbol: c?.Symbol || '',
      createdAt: update.Block?.Time || new Date().toISOString(),
      marketCapUsd: pool ? parseFloat(pool.Pool?.Base?.PostAmountInUSD) || 0 : parseFloat(update.TokenSupplyUpdate?.PostBalanceInUSD) || 0,
      liquidityUsd: pool ? parseFloat(pool.Pool?.Quote?.PostAmountInUSD) || 0 : 0,
      bondingProgress: pool ? calcBonding(pool.Pool?.Base?.PostAmount) : null,
      marketAddress: pool?.Pool?.Market?.MarketAddress || '',
    };
  });

  return { error: null, tokens };
}

export async function fetchAlmostBondedTokens(limit = 50, { feed = 'launches', priority = 'user' } = {}) {
  const poolQuery = `{
    Solana {
      DEXPools(
        limitBy: { by: Pool_Market_BaseCurrency_MintAddress, count: 1 }
        limit: { count: ${limit} }
        orderBy: { descending: Block_Time }
        where: {
          Pool: {
            Base: { PostAmount: { gt: "206900000", lt: "246555000" } }
            Dex: { ProgramAddress: { is: "${PUMP_FUN_PROGRAM}" } }
            Market: { QuoteCurrency: { MintAddress: { in: ["${SOL_MINT}", "11111111111111111111111111111111"] } } }
          }
        }
      ) {
        Pool {
          Market { BaseCurrency { MintAddress Name Symbol } MarketAddress }
          Base { PostAmount PostAmountInUSD }
          Quote { PostAmount PriceInUSD PostAmountInUSD }
        }
      }
    }
  }`;

  const { error, data } = await dlBq(poolQuery, 'fetchAlmostBondedTokens', feed, priority);
  if (error) return { error, tokens: [] };

  const pools = dedup(data?.Solana?.DEXPools || [], x => x.Pool?.Market?.BaseCurrency?.MintAddress);
  const mints = pools.map(p => p.Pool?.Market?.BaseCurrency?.MintAddress).filter(Boolean);

  if (mints.length === 0) return { error: null, tokens: [] };

  const [volumeByMint, firstTradeByMint] = await Promise.all([
    fetchVolumeForMints(mints, 24, 'fetchAlmostBondedTokens', feed),
    fetchFirstTradeTimeForMints(mints, 'fetchAlmostBondedTokens:age', feed),
  ]);

  const tokens = pools.map(pool => {
    const market = pool.Pool?.Market;
    const base = pool.Pool?.Base;
    const quote = pool.Pool?.Quote;
    const mint = market?.BaseCurrency?.MintAddress || '';
    return {
      mint,
      name: market?.BaseCurrency?.Name || '',
      symbol: market?.BaseCurrency?.Symbol || '',
      marketAddress: market?.MarketAddress || '',
      bondingProgress: calcBonding(base?.PostAmount),
      marketCapUsd: parseFloat(base?.PostAmountInUSD) || 0,
      liquidityUsd: parseFloat(quote?.PostAmountInUSD) || 0,
      volume: volumeByMint.get(mint) || 0,
      baseBalance: base?.PostAmount || '0',
      quoteBalance: quote?.PostAmount || '0',
      quotePriceUsd: parseFloat(quote?.PriceInUSD) || 0,
      createdAt: firstTradeByMint.get(mint) || null,
    };
  });

  return { error: null, tokens };
}

export async function fetchMigratedTokens(limit = 50, { feed = 'launches', priority = 'user' } = {}) {
  const query = `{
    Solana {
      DEXPools(
        limitBy: { by: Pool_Market_BaseCurrency_MintAddress, count: 1 }
        limit: { count: ${limit} }
        orderBy: { descending: Block_Time }
        where: {
          Pool: { Dex: { ProtocolName: { is: "pump_amm" } }, Market: { QuoteCurrency: { MintAddress: { in: ["${SOL_MINT}", "${USDC_MINT}"] } } } }
        }
      ) {
        Block { Time }
        Pool {
          Market { BaseCurrency { MintAddress Name Symbol } MarketAddress }
          Base { PostAmount PostAmountInUSD }
          Quote { PostAmount PriceInUSD PostAmountInUSD }
        }
      }
    }
  }`;

  const { error, data } = await dlBq(query, 'fetchMigratedTokens', feed, priority);
  if (error) return { error, tokens: [] };

  const pools = dedup(data?.Solana?.DEXPools || [], x => x.Pool?.Market?.BaseCurrency?.MintAddress);
  const mints = pools.map(p => p.Pool?.Market?.BaseCurrency?.MintAddress).filter(Boolean);

  if (mints.length === 0) return { error: null, tokens: [] };

  const [holdersByMint, txByMint] = await Promise.all([
    fetchHoldersCountForMints(mints, 'fetchMigratedTokens:holders', feed),
    fetchTxCountForMints(mints, 'fetchMigratedTokens:txCount', feed),
  ]);

  const tokens = pools.map(pool => {
    const market = pool.Pool?.Market;
    const mint = market?.BaseCurrency?.MintAddress || '';
    return {
      mint,
      name: market?.BaseCurrency?.Name || '',
      symbol: market?.BaseCurrency?.Symbol || '',
      marketAddress: market?.MarketAddress || '',
      migratedAt: pool.Block?.Time || new Date().toISOString(),
      marketCapUsd: parseFloat(pool.Pool?.Base?.PostAmountInUSD) || 0,
      liquidityUsd: parseFloat(pool.Pool?.Quote?.PostAmountInUSD) || 0,
      quoteBalance: pool.Pool?.Quote?.PostAmount || '0',
      quotePriceUsd: parseFloat(pool.Pool?.Quote?.PriceInUSD) || 0,
      holders: holdersByMint.get(mint) || 0,
      transactions: txByMint.get(mint) || 0,
    };
  });

  return { error: null, tokens };
}

// Signature matches the other launches fetchers: (limit, { hours, feed,
// priority }) — see bitquery.js for the rationale (positional hours made
// `fetcher(limit, FETCH_OPTS)` crash with "Invalid time value").
export async function fetchTrendingTokens(limit = 50, { hours = 1, feed = 'launches', priority = 'user' } = {}) {
  const since = sinceIso(hours);

  const volQuery = `{
    Solana {
      trades: DEXTradeByTokens(
        limitBy: { by: Trade_Currency_MintAddress, count: 1 }
        limit: { count: ${limit} }
        orderBy: { descendingByField: "VolumeInUSD" }
        where: {
          Trade: { Currency: { MintAddress: { endsWith: "pump" } } }
          Block: { Time: { since: "${since}" } }
        }
      ) {
        VolumeInUSD: sum(of: Trade_AmountInUSD)
        Trade { Currency { MintAddress Name Symbol } PriceInUSD }
      }
    }
  }`;

  const { error, data } = await dlBq(volQuery, 'fetchTrendingTokens', feed, priority);
  if (error) return { error, tokens: [] };

  const trades = dedup(data?.Solana?.trades || [], x => x.Trade?.Currency?.MintAddress);
  const mints = trades.map(t => t.Trade?.Currency?.MintAddress).filter(Boolean);

  if (mints.length === 0) return { error: null, tokens: [] };

  const [poolByMint, firstTradeByMint] = await Promise.all([
    fetchPoolsForMints(mints, 'fetchTrendingTokens', feed),
    fetchFirstTradeTimeForMints(mints, 'fetchTrendingTokens:age', feed),
  ]);

  const tokens = trades.map(trade => {
    const mint = trade.Trade?.Currency?.MintAddress || '';
    const pool = poolByMint.get(mint);
    return {
      mint,
      name: trade.Trade?.Currency?.Name || '',
      symbol: trade.Trade?.Currency?.Symbol || '',
      volume: parseFloat(trade.VolumeInUSD) || 0,
      priceUsd: parseFloat(trade.Trade?.PriceInUSD) || 0,
      marketCapUsd: pool ? parseFloat(pool.Pool?.Base?.PostAmountInUSD) || 0 : 0,
      liquidityUsd: pool ? parseFloat(pool.Pool?.Quote?.PostAmountInUSD) || 0 : 0,
      bondingProgress: pool ? calcBonding(pool.Pool?.Base?.PostAmount) : null,
      marketAddress: pool?.Pool?.Market?.MarketAddress || '',
      createdAt: firstTradeByMint.get(mint) || null,
    };
  });

  return { error: null, tokens };
}

export async function fetchTokenDetails(mint, { feed = 'tokenDetail', priority = 'user' } = {}) {
  const query = `{
    Solana {
      DEXPools(
        limit: { count: 1 }
        orderBy: { descending: Block_Time }
        where: {
          Pool: { Market: { BaseCurrency: { MintAddress: { is: "${mint}" } } } }
        }
      ) {
        Pool {
          Market { BaseCurrency { MintAddress Name Symbol } }
          Base { PostAmount PostAmountInUSD }
          Quote { PostAmount PriceInUSD PostAmountInUSD }
        }
      }
      DEXTradeByTokens(
        limit: { count: 1 }
        orderBy: { descending: Block_Time }
        where: {
          Trade: { Currency: { MintAddress: { is: "${mint}" } } }
        }
      ) {
        Trade { Price PriceInUSD }
      }
    }
  }`;

  const { error, data } = await dlBq(query, 'fetchTokenDetails', 'tokenDetail', priority);
  if (error) return { error, token: null };

  const pool = data?.Solana?.DEXPools?.[0];
  const trade = data?.Solana?.DEXTradeByTokens?.[0];

  return {
    error: null,
    token: {
      mint,
      name: pool?.Pool?.Market?.BaseCurrency?.Name || '',
      symbol: pool?.Pool?.Market?.BaseCurrency?.Symbol || '',
      priceUsd: parseFloat(trade?.Trade?.PriceInUSD) || 0,
      marketCapUsd: parseFloat(pool?.Pool?.Base?.PostAmountInUSD) || 0,
      liquidityUsd: parseFloat(pool?.Pool?.Quote?.PostAmountInUSD) || 0,
      baseBalance: pool?.Pool?.Base?.PostAmount || '0',
      bondingProgress: calcBonding(pool?.Pool?.Base?.PostAmount),
    },
  };
}

// ChainStream's Trading.Pairs cube exposes pre-aggregated 1-minute bars only.
// We fetch enough 1-minute bars to cover the requested interval and candle
// count, then bucket them into intervalMinutes candles locally.
export async function fetchTokenOHLC(mint, { intervalMinutes = 5, limit = 100, feed = 'chart', priority = 'user' } = {}) {
  const fetchCount = Math.min(limit * intervalMinutes, 30000);
  const query = `{
    Trading {
      Pairs(
        where: {
          Token: { Address: { is: "${mint}" } }
          Market: { Network: { is: "sol" } }
        }
        limit: { count: ${fetchCount} }
        orderBy: { descending: Block_Time }
      ) {
        Interval { Time { Start } }
        Price { Ohlc { Open High Low Close } }
        Volume { Usd }
      }
    }
  }`;

  const result = await dlBq(query, ':ohlc', feed, priority);
  if (result.error) return { error: result.error, candles: [] };

  const raw = result.data?.Trading?.Pairs || [];
  const binMs = intervalMinutes * 60 * 1000;
  const buckets = new Map();

  const toMs = (v) => {
    const n = Date.parse(v);
    if (!Number.isNaN(n)) return n;
    const num = parseFloat(v);
    return num < 1e12 ? num * 1000 : num;
  };

  for (const bar of raw) {
    const ts = toMs(bar.Interval?.Time?.Start);
    if (!ts) continue;
    const key = Math.floor(ts / binMs) * binMs;
    if (!buckets.has(key)) {
      buckets.set(key, { open: 0, high: 0, low: Infinity, close: 0, volume: 0 });
    }
    const b = buckets.get(key);
    const rowOpen = parseFloat(bar.Price?.Ohlc?.Open) || 0;
    const rowHigh = parseFloat(bar.Price?.Ohlc?.High) || 0;
    const rowLow = parseFloat(bar.Price?.Ohlc?.Low) || 0;
    const rowClose = parseFloat(bar.Price?.Ohlc?.Close) || 0;
    const rowVol = parseFloat(bar.Volume?.Usd) || 0;
    if (b.open === 0) b.open = rowOpen;
    b.high = Math.max(b.high, rowHigh);
    b.low = Math.min(b.low, rowLow);
    b.close = rowClose;
    b.volume += rowVol;
  }

  const candles = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, b]) => ({
      time: new Date(key).toISOString(),
      open: b.open,
      high: b.high,
      low: b.low === Infinity ? 0 : b.low,
      close: b.close,
      volume: b.volume,
      trades: 0,
    }));

  return { error: null, candles };
}

const MAJOR_MINTS = new Set([
  SOL_MINT,
  USDC_MINT,
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
  'stqEc6wXJb1XDjL5DyEXsLpfR7CfQ1F2tSCLXJxK66z',
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1XS7et',
]);
const MAJOR_SYMBOLS = new Set(['SOL', 'USDC', 'USDT', 'WSOL', 'MSOL', 'STSOL']);

export async function fetchMovers(limit = 30, { feed = 'movers', priority = 'user' } = {}) {
  const since = sinceIso(24);
  const fetchLimit = limit * 3;

  const volQuery = `{
    Solana {
      trades: DEXTradeByTokens(
        limitBy: { by: Trade_Currency_MintAddress, count: 1 }
        limit: { count: ${fetchLimit} }
        orderBy: { descendingByField: "VolumeInUSD" }
        where: {
          Trade: {
            Currency: { MintAddress: { endsWith: "pump" } }
          }
          Block: { Time: { since: "${since}" } }
        }
      ) {
        VolumeInUSD: sum(of: Trade_AmountInUSD)
        Trade { Currency { MintAddress Name Symbol } }
      }
    }
  }`;

  const { error, data } = await dlBq(volQuery, 'fetchMovers', feed, priority);
  if (error) return { error, tokens: [] };

  const trades = data?.Solana?.trades || [];

  const filtered = trades.filter(trade => {
    const mint = trade.Trade?.Currency?.MintAddress || '';
    const symbol = (trade.Trade?.Currency?.Symbol || '').toUpperCase();
    if (MAJOR_MINTS.has(mint)) return false;
    if (MAJOR_SYMBOLS.has(symbol)) return false;
    return true;
  });

  const tokens = filtered.slice(0, limit);
  const mints = tokens.map(t => t.Trade?.Currency?.MintAddress).filter(Boolean);

  if (mints.length === 0) return { error: null, tokens: [] };

  const buyerCounts = await fetchBuyerCountsForMints(mints, 24, 'fetchMovers', feed);

  return {
    error: null,
    tokens: tokens.map(trade => {
      const mint = trade.Trade?.Currency?.MintAddress || '';
      return {
        mint,
        name: trade.Trade?.Currency?.Name || '',
        symbol: trade.Trade?.Currency?.Symbol || '',
        volume: parseFloat(trade.VolumeInUSD) || 0,
        buyers: buyerCounts.get(mint) || 0,
      };
    }),
  };
}

async function fetchBuyerCountsForMints(mints, hours, label = '', feed = 'movers') {
  const counts = new Map();
  if (mints.length === 0) return counts;

  const since = sinceIso(hours);
  const rowLimit = Math.min(Math.max(mints.length * 50, 1000), 25000);

  const query = `{
    Solana {
      DEXTradeByTokens(
        limit: { count: ${rowLimit} }
        orderBy: { descending: Block_Time }
        where: {
          Trade: {
            Currency: { MintAddress: { in: [${gqlStr(mints)}] } }
            Side: { Type: { is: "buy" } }
          }
          Block: { Time: { since: "${since}" } }
        }
      ) {
        Trade { Currency { MintAddress } Account { Owner } }
      }
    }
  }`;

  const { error, data } = await dlBq(query, label, feed);
  if (error) return counts;

  const seen = new Map();
  for (const row of data?.Solana?.DEXTradeByTokens || []) {
    const mint = row.Trade?.Currency?.MintAddress;
    const wallet = row.Trade?.Account?.Owner;
    if (!mint || !wallet) continue;
    if (!seen.has(mint)) seen.set(mint, new Set());
    seen.get(mint).add(wallet);
  }

  for (const [mint, wallets] of seen) {
    counts.set(mint, wallets.size);
  }
  return counts;
}