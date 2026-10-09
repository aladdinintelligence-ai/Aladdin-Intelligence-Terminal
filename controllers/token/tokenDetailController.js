import { provider as dataProvider } from '../../providers/index.js';
import config from '../../configs/dataLayer.js';
import dl from '../../providers/dataLayer.js';
import coldBuildLimiter from '../../services/coldBuildLimiter.js';
import { annotateTradesWithBehaviour } from '../../services/tradeBehaviourService.js';
import { annotateWallets, groupParticipants } from '../../services/participantBehaviourService.js';
import { Token } from '../../models/index.js';
import mongoose from 'mongoose';

// ---- tokenDetail watch budget (approved plan) ----
// Actively-watched mints (top `detailHotMintCap`) are refreshed ONLY by an
// internal scheduler at a `detailRefreshFloorMs` floor, and only for the two
// detail tabs the UI polls (trades + stats): 2 upstream calls / mint / floor.
// Every client poll is a cache read (fresh or passively stale) and can NEVER
// spend an upstream call. Mints outside the cap get longer TTLs and are only
// refreshed when they re-enter the watched set (or on an LRU-eviction miss).

const FEED = 'tokenDetail';

// Canonical build sizes: one image per (mint, tab) serves every requested
// limit by slicing server-side, so client limit variance can never fragment
// the cache into per-poll misses.
const CANONICAL_LIMIT = 200;

// Which tabs are scheduler-refreshed for watched mints (the "2 calls/mint").
const REFRESHED_TABS = new Set(['trades', 'stats']);
const ON_DEMAND_TABS = new Set(['participants', 'holders', 'first-buyers']);
const TABS = new Set(['trades', 'participants', 'holders', 'first-buyers', 'stats']);

const watch = new Map();
const watchRefreshAt = new Map();
let watchTimer = null;

function nowMs() {
  return Date.now();
}

function pruneWatch() {
  const idle = config.telemetryMintIdleMs;
  for (const [mint, e] of watch) {
    if (nowMs() - e.lastSeen > idle) watch.delete(mint);
  }
}

function bump(mint) {
  const e = watch.get(mint) || { hits: 0, lastSeen: 0 };
  e.hits += 1;
  e.lastSeen = nowMs();
  watch.set(mint, e);
  ensureWatchTimer();
}

function hotMints() {
  pruneWatch();
  return [...watch.entries()]
    .sort((a, b) => b[1].hits - a[1].hits || b[1].lastSeen - a[1].lastSeen)
    .slice(0, config.detailHotMintCap)
    .map(([mint]) => mint);
}

function isHotMint(mint) {
  return hotMints().includes(mint);
}

async function tickWatch() {
  const floor = config.detailRefreshFloorMs;
  try {
    for (const mint of hotMints()) {
      const due = watchRefreshAt.get(mint) || 0;
      if (nowMs() - due < floor) continue;
      watchRefreshAt.set(mint, nowMs());
      for (const tab of REFRESHED_TABS) {
        try {
          await dl.fetch({
            key: `detail:${mint}:${tab}`,
            feed: FEED,
            priority: 'user',
            force: true,
            request: () => buildTab(tab, mint),
          });
        } catch (e) {
          console.error('[tokenDetail] watch refresh failed:', e && e.message ? e.message : e);
        }
      }
    }
  } catch (e) {
    console.error('[tokenDetail] watch refresh error:', e && e.message ? e.message : e);
  }
}

function ensureWatchTimer() {
  if (watchTimer) return;
  watchTimer = setInterval(() => tickWatch(), config.detailTickMs);
  watchTimer.unref && watchTimer.unref();
}

// Provider queries flow through the data layer: budget gate, token bucket,
// circuit breaker, retry/backoff, per-query negative caching of permanent
// client errors, and caching of successful-but-empty results (`emptyTtlMs`) so
// well-formed mints with no data stop spending calls per poll.
async function dlBq(query, label, isEmpty) {
  const res = await dl.bitquery(query, label, {
    feed: FEED,
    priority: 'user',
    emptyTtlMs: config.detailEmptyTtlMs,
    isEmpty,
  });
  if (res.error) throw new Error(res.error);
  return res;
}

function isEmptyTrades(data) {
  return !(data?.Solana?.DEXTradeByTokens || []).length;
}

async function fetchTrades(mint) {
  const query = `{
    Solana {
      DEXTradeByTokens(
        limit: { count: ${CANONICAL_LIMIT} }
        orderBy: { descending: Block_Time }
        where: {
          Trade: { Currency: { MintAddress: { is: "${mint}" } }, Amount: { gt: "0" } }
        }
      ) {
        Block { Time }
        Trade {
          Side { Type }
          Amount
          PriceInUSD
          Account { Owner }
        }
        Transaction { Signature }
      }
      totals: DEXTradeByTokens(
        where: {
          Trade: { Currency: { MintAddress: { is: "${mint}" } }, Amount: { gt: "0" } }
        }
      ) {
        BuysAll: sum(of: Trade_AmountInUSD, if: { Trade: { Side: { Type: { is: buy } } } })
        SellsAll: sum(of: Trade_AmountInUSD, if: { Trade: { Side: { Type: { is: sell } } } })
        VolumeAll: sum(of: Trade_AmountInUSD)
      }
    }
  }`;
  const { data } = await dlBq(query, ':trades', isEmptyTrades);

  const trades = (data?.Solana?.DEXTradeByTokens || []).map(t => ({
    time: t.Block?.Time,
    side: t.Trade?.Side?.Type?.toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
    amount: parseFloat(t.Trade?.Amount) || 0,
    priceUsd: parseFloat(t.Trade?.PriceInUSD) || 0,
    wallet: t.Trade?.Account?.Owner || '',
    signature: t.Transaction?.Signature || '',
  }));

  // All-time buy/sell volume ("full-range" = every fill since the token's
  // creation, no time filter), so the tape's Buys/Sells are lifetime totals
  // instead of a 50-row window.
  const tAll = data?.Solana?.totals?.[0] || {};
  const totals = {
    buysAll: parseFloat(tAll?.BuysAll) || 0,
    sellsAll: parseFloat(tAll?.SellsAll) || 0,
    volumeAll: parseFloat(tAll?.VolumeAll) || 0,
  };

  // Creator is optional signal for the behaviour slider: tracked tokens carry
  // it in Mongo, but a missing/falling DB must never take the trades tab down.
  const creator = await findTokenCreator(mint);

  return { trades: annotateTradesWithBehaviour(trades, creator), totals };
}

async function findTokenCreator(mint) {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) return null;
  try {
    const doc = await Token.findById(mint, { creator: 1, _id: 0 }).lean();
    return doc && doc.creator ? doc.creator : null;
  } catch (err) {
    console.error('[tokenDetail] creator lookup skipped:', err && err.message ? err.message : err);
    return null;
  }
}

async function fetchParticipants(mint) {
  const query = `{
    Solana {
      DEXTradeByTokens(
        limit: { count: ${CANONICAL_LIMIT} }
        orderBy: { descending: Block_Time }
        where: {
          Trade: { Currency: { MintAddress: { is: "${mint}" } }, Amount: { gt: "0" } }
        }
      ) {
        Block { Time }
        Trade {
          Side { Type }
          Amount
          PriceInUSD
          Account { Owner }
        }
        Transaction { Signature }
      }
    }
  }`;
  const { data } = await dlBq(query, ':participants', isEmptyTrades);

  const byWallet = new Map();
  for (const t of data?.Solana?.DEXTradeByTokens || []) {
    const addr = t.Trade?.Account?.Owner;
    if (!addr) continue;
    if (!byWallet.has(addr)) {
      byWallet.set(addr, { wallet: addr, trades: 0, buys: 0, sells: 0, totalVolumeUsd: 0, firstTrade: t.Block?.Time, lastTrade: t.Block?.Time, buyTimesMs: [], sellTimesMs: [] });
    }
    const w = byWallet.get(addr);
    w.trades++;
    const ms = Date.parse(t.Block?.Time) || null;
    const side = t.Trade?.Side?.Type?.toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
    if (side === 'BUY') {
      w.buys++;
      if (ms) w.buyTimesMs.push(ms);
    } else {
      w.sells++;
      if (ms) w.sellTimesMs.push(ms);
    }
    w.totalVolumeUsd += parseFloat(t.Trade?.PriceInUSD) || 0;
    if (t.Block?.Time < w.firstTrade) w.firstTrade = t.Block?.Time;
    if (t.Block?.Time > w.lastTrade) w.lastTrade = t.Block?.Time;
  }

  // Creator is token-specific and anchors the Creator Wallet label.
  const creator = await findTokenCreator(mint);

  const wallets = [...byWallet.values()]
    .sort((a, b) => b.totalVolumeUsd - a.totalVolumeUsd)
    .slice(0, CANONICAL_LIMIT)
    .map(w => ({
      wallet: w.wallet,
      short: `${w.wallet.slice(0, 4)}...${w.wallet.slice(-4)}`,
      trades: w.trades,
      buys: w.buys,
      sells: w.sells,
      totalVolumeUsd: w.totalVolumeUsd,
      firstTrade: w.firstTrade,
      lastTrade: w.lastTrade,
    }));

  return {
    groups: groupParticipants(wallets, creator),
    wallets: annotateWallets(wallets, creator),
  };
}

async function fetchHolders(mint) {
  const query = `{
    Solana {
      BalanceUpdates(
        limitBy: { by: [BalanceUpdate_Currency_MintAddress, BalanceUpdate_Account_Address], count: 1 }
        limit: { count: 5000 }
        orderBy: { descending: Block_Slot }
        where: {
          BalanceUpdate: { Currency: { MintAddress: { is: "${mint}" } } }
          Transaction: { Result: { Success: true } }
        }
      ) {
        BalanceUpdate {
          Account { Address }
          PostBalance
        }
      }
    }
  }`;
  const isEmptyHolders = (d) => !(d?.Solana?.BalanceUpdates || []).length;
  const { data } = await dlBq(query, ':holders', isEmptyHolders);

  const balances = new Map();
  for (const row of data?.Solana?.BalanceUpdates || []) {
    const addr = row.BalanceUpdate?.Account?.Address;
    const bal = parseFloat(row.BalanceUpdate?.PostBalance) || 0;
    if (addr && bal > 0) balances.set(addr, bal);
  }

  const total = [...balances.values()].reduce((s, v) => s + v, 0);
  return [...balances.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CANONICAL_LIMIT)
    .map(([addr, bal], i) => ({
      rank: i + 1,
      wallet: addr,
      short: `${addr.slice(0, 4)}...${addr.slice(-4)}`,
      balance: bal,
      supplyPct: total > 0 ? ((bal / total) * 100).toFixed(2) : '0',
    }));
}

async function fetchFirstBuyers(mint) {
  const query = `{
    Solana {
      DEXTradeByTokens(
        limit: { count: ${CANONICAL_LIMIT} }
        orderBy: { ascending: Block_Time }
        where: {
          Trade: { Currency: { MintAddress: { is: "${mint}" } }, Side: { Type: { is: buy } }, Amount: { gt: "0" } }
        }
      ) {
        Block { Time }
        Trade { Amount PriceInUSD Account { Owner } }
        Transaction { Signature }
      }
    }
  }`;
  const { data } = await dlBq(query, ':firstBuyers', isEmptyTrades);

  const seen = new Set();
  const buyers = [];
  for (const t of data?.Solana?.DEXTradeByTokens || []) {
    const addr = t.Trade?.Account?.Owner;
    if (!addr || seen.has(addr)) continue;
    seen.add(addr);
    buyers.push({
      rank: buyers.length + 1,
      wallet: addr,
      short: `${addr.slice(0, 4)}...${addr.slice(-4)}`,
      firstBuyTime: t.Block?.Time,
      amountUsd: parseFloat(t.Trade?.PriceInUSD) || 0,
    });
    if (buyers.length >= CANONICAL_LIMIT) break;
  }
  return buyers;
}

async function fetchTokenStats(mint) {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const query = `{
    Solana {
      trades24h: DEXTradeByTokens(
        where: {
          Trade: { Currency: { MintAddress: { is: "${mint}" } }, Amount: { gt: "0" } }
          Block: { Time: { since: "${since24h}" } }
        }
      ) {
        TradeCount24h: count
        Volume24h: sum(of: Trade_AmountInUSD)
        Buys24h: sum(of: Trade_AmountInUSD, if: { Trade: { Side: { Type: { is: buy } } } })
        Sells24h: sum(of: Trade_AmountInUSD, if: { Trade: { Side: { Type: { is: sell } } } })
      }
      trades1h: DEXTradeByTokens(
        where: {
          Trade: { Currency: { MintAddress: { is: "${mint}" } }, Amount: { gt: "0" } }
          Block: { Time: { since: "${since1h}" } }
        }
      ) {
        TradeCount1h: count
        Volume1h: sum(of: Trade_AmountInUSD)
      }
      holders: BalanceUpdates(
        limitBy: { by: [BalanceUpdate_Currency_MintAddress, BalanceUpdate_Account_Address], count: 1 }
        limit: { count: 5000 }
        orderBy: { descending: Block_Slot }
        where: {
          BalanceUpdate: { Currency: { MintAddress: { is: "${mint}" } } }
          Transaction: { Result: { Success: true } }
        }
      ) {
        BalanceUpdate {
          Account { Address }
          PostBalance
        }
      }
    }
  }`;
  const isEmptyStats = (d) => !(d?.Solana?.trades24h?.length || d?.Solana?.trades1h?.length || d?.Solana?.holders?.length);
  const { data } = await dlBq(query, ':stats', isEmptyStats);

  const t24 = data?.Solana?.trades24h?.[0];
  const t1h = data?.Solana?.trades1h?.[0];

  const balances = new Map();
  for (const row of data?.Solana?.holders || []) {
    const addr = row.BalanceUpdate?.Account?.Address;
    const bal = parseFloat(row.BalanceUpdate?.PostBalance) || 0;
    if (addr && bal > 0) balances.set(addr, bal);
  }
  const holderCount = balances.size;
  const totalSupply = [...balances.values()].reduce((s, v) => s + v, 0);
  const sorted = [...balances.values()].sort((a, b) => b - a);
  const top10Pct = totalSupply > 0 ? ((sorted.slice(0, 10).reduce((s, v) => s + v, 0) / totalSupply) * 100).toFixed(1) : '0';

  return {
    trades24h: parseInt(t24?.TradeCount24h) || 0,
    volume24h: parseFloat(t24?.Volume24h) || 0,
    buys24h: parseFloat(t24?.Buys24h) || 0,
    sells24h: parseFloat(t24?.Sells24h) || 0,
    trades1h: parseInt(t1h?.TradeCount1h) || 0,
    volume1h: parseFloat(t1h?.Volume1h) || 0,
    holders: holderCount,
    top10Pct: parseFloat(top10Pct),
  };
}

async function buildTab(tab, mint) {
  let data;
  let totals = null;
  switch (tab) {
    case 'trades': {
      const bundle = await fetchTrades(mint);
      data = bundle.trades;
      totals = bundle.totals;
      break;
    }
    case 'participants':
      data = await fetchParticipants(mint);
      break;
    case 'holders':
      data = await fetchHolders(mint);
      break;
    case 'first-buyers':
      data = await fetchFirstBuyers(mint);
      break;
    case 'stats':
      data = await fetchTokenStats(mint);
      break;
    default:
      throw new Error('Invalid tab: ' + tab);
  }

  return {
    data,
    totals,
    meta: { mint, tab, count: Array.isArray(data) ? data.length : (data && data.groups ? data.groups.length : 1), source: dataProvider, fetchedAt: new Date().toISOString() },
  };
}

export async function getTokenDetailController(req, res, next) {
  const { mint } = req.params;
  const tab = req.query.tab || 'trades';
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);

  if (!TABS.has(tab)) {
    return res.status(400).json({ error: `Invalid tab: ${tab}` });
  }

  bump(mint);

  try {
    // Watched (hot) mints get the refresh floor as their fresh TTL on the tabs
    // the scheduler maintains; everyone else gets longer TTLs. All reads are
    // passive (stale) so a poll can never touch the wire.
    const freshMs = isHotMint(mint) && REFRESHED_TABS.has(tab)
      ? config.detailHotFreshTtlMs
      : REFRESHED_TABS.has(tab)
        ? config.detailColdFreshTtlMs
        : config.detailOnDemandFreshTtlMs;

    const key = `detail:${mint}:${tab}`;

    // Cold gate: only a request that would spend an upstream Bitquery call
    // (key neither cached nor already building) is rate limited, per user and
    // per IP (TD_COLD_RATE_PER_MIN / TD_COLD_RATE_WINDOW_MS). Cached/warm
    // polls stay unbounded and an in-flight build of this exact key is joined
    // for free. Over the limit: cached data is still served by dl.fetch when
    // it exists; with nothing cached the answer is 429.
    if (!dl.hasCached(key) && !dl.hasInflight(key)) {
      const verdict = coldBuildLimiter.take(req.user && req.user.userId, req.ip || (req.socket && req.socket.remoteAddress));
      if (!verdict.allowed) {
        res.setHeader('Retry-After', String(verdict.retryAfter));
        return res.status(429).json({
          error: 'rate_limited',
          reason: verdict.reason,
          message: `Cold token lookups are limited to ${config.detailColdBuildRatePerMin} per minute. Please retry in ${verdict.retryAfter}s.`,
        });
      }
    }

    const out = await dl.fetch({
      key,
      feed: FEED,
      priority: 'user',
      freshTtlMs: freshMs,
      staleTtlMs: config.detailStaleTtlMs,
      passiveStale: true,
      request: () => buildTab(tab, mint),
    });

    if (out.unavailable) {
      return res.status(503).json({
        error: 'upstream_unavailable',
        message: 'Live market data is temporarily unavailable. Please try again in a few minutes.',
      });
    }

    // Serve a fresh copy sliced to the requested limit so the cached image is
    // never mutated by a client.
    const built = out.data;
    const served = Array.isArray(built.data) ? built.data.slice(0, limit) : built.data;
    const response = {
      ...built,
      data: served,
      meta: { ...built.meta, count: Array.isArray(served) ? served.length : 1 },
    };
    if (out.stale && built.meta) response.meta.stale = true;
    return res.json(response);
  } catch (exc) {
    console.error('[tokenDetail] handler error:', exc && exc.message ? exc.message : exc);
    return res.status(502).json({
      error: 'upstream_unavailable',
      message: 'Live market data is temporarily unavailable. Please try again in a few minutes.',
    });
  }
}