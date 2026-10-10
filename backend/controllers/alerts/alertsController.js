import { provider as dataProvider } from '../../providers/index.js';
import dl from '../../providers/dataLayer.js';

// Live behavioural alerts for the /alerts workspace. Every event is derived
// from the same on-chain evidence the other workspaces use: a window of recent
// DEX trades (Bitquery) crossed with market metrics (DexScreener pairs). The
// alert feed is deliberately a decision queue, not a scoreboard — each row
// points at the specific wallet / flow / market change that fired it.

// Candidate pool: top traded pump.mints over 7d, then market-quality gate.
const CANDIDATE_LIMIT = 200;
const MC_MIN = 5_000;
const LIQ_MIN = 1_500;
// Trades window scanned per build; events are stamped by their latest leg.
const TRADE_WINDOW_MIN = 30;
// Mints whose recent trades are scanned each build (one batched query).
const MAX_CANDIDATES_SCAN = 8;
// A buy leg this size from one wallet = a proven, committed entry.
const PROVEN_BUY_USD = 1_000;
// Net sells this size from one wallet = early holder distribution.
const DISTRIBUTE_SELL_USD = 800;
// Three or more wallets buying inside this window = cluster activity.
const CLUSTER_WALLETS = 3;
const CLUSTER_SPAN_MS = 5 * 60 * 1000;
// Migration = this share of 24h trade volume routed on mature AMMs.
const MIGRATED_SHARE = 85;
// Momentum = this 24h gain on at least this 24h volume.
const MOMENTUM_CHANGE = 40;
const MOMENTUM_VOLUME = 50_000;
// Fresh listing = launched within the last hour(s), still tiny.
const LAUNCH_MAX_AGE_H = 6;
const LAUNCH_MAX_MC = 400_000;
const FRESH_EVENT_MS = 5 * 60 * 1000;
// Event definitions keep the UI and the Ask-Aladdin context consistent.
const EVENT_DEFS = {
  proven_entry: { key: 'Proven wallet entered', severity: 'high' },
  distribution: { key: 'Early holder distribution', severity: 'high' },
  migration: { key: 'Migration completed', severity: 'high' },
  momentum: { key: 'Momentum surge', severity: 'high' },
  launch: { key: 'Just launched', severity: 'high' },
  cluster: { key: 'Cluster activity', severity: 'medium' },
  rotation: { key: 'Flow rotated', severity: 'medium' },
};

const BOND_DEX = new Set(['pumpfun', 'pump', 'pumpswap']);
const MATURE_DEX = new Set(['raydium', 'meteora', 'orca']);

const colors = [
  '#f1a8bf', '#55c7ea', '#8b7cf6', '#43c98b', '#d872f2',
  '#f2bd52', '#58a9f4', '#a697bb', '#ec795f', '#33d6a6',
  '#f1ce55', '#54cbb3', '#d99157', '#9b7cff', '#b89167',
  '#77a9ff', '#946cff', '#55d5ef', '#cf77d9', '#f39abe',
];

function generateColor(mint) {
  let hash = 0;
  for (let i = 0; i < mint.length; i++) {
    hash = ((hash << 5) - hash + mint.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

function sinceIso(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function shortAddr(addr) {
  return addr && addr.length > 8 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : (addr || '');
}

function compactUsd(v) {
  if (v == null || !Number.isFinite(v)) return '0';
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `${Math.round(v / 1e3)}K`;
  return String(Math.round(v));
}

async function dlBq(query, label) {
  const res = await dl.bitquery(query, label, { feed: 'alerts', priority: 'user' });
  if (res.error) throw new Error(res.error);
  return res;
}

// Top traded meme tokens over the last week: the pool of tokens worth alerting on.
async function fetchVolumeLeaders() {
  const since7d = sinceIso(24 * 60 * 7);
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

  const { data } = await dlBq(query, ':alerts:leaders');

  const leaders = [];
  const seen = new Set();
  for (const row of (data && data.Solana && data.Solana.trades) || []) {
    const mint = row.Trade && row.Trade.Currency && row.Trade.Currency.MintAddress;
    if (!mint || seen.has(mint)) continue;
    seen.add(mint);
    leaders.push({
      mint,
      name: row.Trade.Currency.Name || '',
      symbol: row.Trade.Currency.Symbol || '',
      volume7d: parseFloat(row.VolumeInUSD) || 0,
    });
  }
  return leaders;
}

function mapMarket(pairs) {
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
  for (const p of pairs) {
    const v = p && p.volume && p.volume.h24 != null ? Number(p.volume.h24) : 0;
    const dex = String(p.dexId || '').toLowerCase();
    if (MATURE_DEX.has(dex)) matureVol += v;
    else if (BOND_DEX.has(dex)) bondVol += v;
  }
  const migTotal = matureVol + bondVol;
  return {
    launchedAt: launches.length ? new Date(launches[0]).toISOString() : null,
    symbol: best && best.baseToken && best.baseToken.symbol ? String(best.baseToken.symbol).trim() : null,
    name: best && best.baseToken && best.baseToken.name ? String(best.baseToken.name).trim() : null,
    marketCapUsd: best ? (best.marketCap != null ? Number(best.marketCap) : (best.fdv != null ? Number(best.fdv) : 0)) : 0,
    liquidityUsd: best && best.liquidity && best.liquidity.usd != null ? Number(best.liquidity.usd) : 0,
    volume24h: best && best.volume && best.volume.h24 != null ? Number(best.volume.h24) : 0,
    change24h: best && best.priceChange && best.priceChange.h24 != null ? Number(best.priceChange.h24) : null,
    change1h: best && best.priceChange && best.priceChange.h1 != null ? Number(best.priceChange.h1) : null,
    imageUrl: best && best.info && best.info.imageUrl ? best.info.imageUrl : null,
    migration: migTotal > 0 ? Math.round((matureVol / migTotal) * 100) : null,
  };
}

async function fetchPairsByMint(mints) {
  const res = await dl.dexBatch(mints, { feed: 'alerts' });
  if (res.error) throw new Error(res.error);
  const pairsByMint = new Map();
  for (const mint of mints) {
    const pairs = (res[mint] || []).filter(function (p) { return p && p.baseToken && p.baseToken.address === mint; });
    if (pairs.length) pairsByMint.set(mint, pairs);
  }
  return pairsByMint;
}

// One batched query pulls the last 30 minutes of fills for the scanned mints,
// bounded per (mint, wallet) so loud wallets cannot flood the window.
async function fetchRecentTrades(mints) {
  if (mints.length === 0) return [];
  const since = sinceIso(TRADE_WINDOW_MIN);
  const quoted = mints.map(function (m) { return '"' + m + '"'; }).join(', ');
  const query = `{
    Solana {
      DEXTradeByTokens(
        limitBy: { by: [Trade_Currency_MintAddress, Trade_Account_Address], count: 60 }
        limit: { count: 50000 }
        orderBy: { descending: Block_Time }
        where: {
          Trade: { Currency: { MintAddress: { in: [${quoted}] } }, Amount: { gt: "0" } }
          Transaction: { Result: { Success: true } }
          Block: { Time: { since: "${since}" } }
        }
      ) {
        Block { Time }
        Trade {
          Currency { MintAddress }
          Side { Type }
          Account { Address }
          AmountInUSD
        }
      }
    }
  }`;
  const { data } = await dlBq(query, ':alerts:trades');

  return (data && data.Solana && data.Solana.DEXTradeByTokens) || [];
}

// Pure event derivation (unit-tested). candidates carry market metrics;
// tradesByMint maps mint -> { wallet, side, usd, timeMs }[]; previous carries
// the last build's per-mint { direction, keys } for rotation/change detection.
// Returns { alerts, signals } — signals feeds the next build.
export function deriveAlertEvents(candidates, tradesByMint, previous) {
  const now = Date.now();
  const prev = previous instanceof Map ? previous : new Map();
  const signals = new Map();
  const alerts = [];

  for (const c of candidates) {
    const market = c.market || {};
    const ageHours = c.ageHours;
    const trades = (tradesByMint && tradesByMint.get(c.mint)) || [];
    const symbol = (c.symbol || '').toUpperCase() || 'USDC';

    const byWallet = new Map();
    let buySpanMs = Infinity;
    const buyTimes = [];
    for (const t of trades) {
      if (!t.wallet) continue;
      let w = byWallet.get(t.wallet);
      if (!w) {
        w = { wallet: t.wallet, buys: 0, sells: 0, buyUsd: 0, sellUsd: 0, firstT: null, lastT: null };
        byWallet.set(t.wallet, w);
      }
      if (t.side === 'BUY') {
        w.buys += 1;
        w.buyUsd += t.usd || 0;
        buyTimes.push(t.timeMs);
      } else {
        w.sells += 1;
        w.sellUsd += t.usd || 0;
      }
      if (t.timeMs != null) {
        if (w.firstT == null || t.timeMs < w.firstT) w.firstT = t.timeMs;
        if (w.lastT == null || t.timeMs > w.lastT) w.lastT = t.timeMs;
      }
    }
    if (buyTimes.length >= 2) {
      buyTimes.sort(function (a, b) { return a - b; });
      for (let i = 1; i < buyTimes.length; i++) {
        const span = buyTimes[i] - buyTimes[i - 1];
        if (span < buySpanMs) buySpanMs = span;
      }
    }
    const totalBuy = [...byWallet.values()].reduce((s, w) => s + w.buyUsd, 0);
    const totalSell = [...byWallet.values()].reduce((s, w) => s + w.sellUsd, 0);
    const direction = totalSell > totalBuy ? 'dist' : totalBuy >= totalSell * 1.2 ? 'acc' : 'mixed';

    const prevState = prev.get(c.mint);
    const keys = new Set();

    const push = (type, usd, detail, wallets, time, opts) => {
      const def = EVENT_DEFS[type];
      keys.add(type);
      alerts.push({
        id: `${type}:${c.mint}`,
        type,
        key: def.key,
        severity: def.severity,
        signal: def.severity === 'high',
        mint: c.mint,
        symbol: c.symbol || '',
        name: c.name || '',
        market,
        mc: market.marketCapUsd || 0,
        liquidity: market.liquidityUsd || 0,
        volume24h: market.volume24h || 0,
        change24h: market.change24h != null ? market.change24h : null,
        usd: usd,
        detail,
        wallets,
        time: new Date(time).toISOString(),
        isNew: now - time <= FRESH_EVENT_MS,
        isChanged: Boolean(prevState && !prevState.keys.has(type)),
        ...(opts || {}),
      });
    };

    if (market.migration != null && market.migration >= MIGRATED_SHARE && ageHours != null && ageHours <= 24 * 30) {
      push('migration', null, `${market.migration}% of $${symbol}'s 24h volume is now routed on mature AMMs — off the bonding curve.`, [], now);
    }

    if (market.change24h != null && market.change24h >= MOMENTUM_CHANGE && market.volume24h >= MOMENTUM_VOLUME) {
      push('momentum', market.volume24h, `${market.change24h.toFixed(0)}% in 24h on $${compactUsd(market.volume24h)} volume at $${compactUsd(market.marketCapUsd)} MC.`, [], now);
    }

    if (ageHours != null && ageHours <= LAUNCH_MAX_AGE_H && market.marketCapUsd <= LAUNCH_MAX_MC) {
      push('launch', null, `Launched ${ageHours < 1 ? Math.round(ageHours * 60) + 'm' : Math.round(ageHours) + 'h'} ago at $${compactUsd(market.marketCapUsd)} MC — early participation only.`, [], now);
    }

    const topBuyer = [...byWallet.values()].sort(function (a, b) { return b.buyUsd - a.buyUsd; })[0];
    if (topBuyer && topBuyer.buyUsd >= PROVEN_BUY_USD) {
      push('proven_entry', topBuyer.buyUsd, `${shortAddr(topBuyer.wallet)} committed $${compactUsd(topBuyer.buyUsd)} into $${symbol} in a single window.`, [shortAddr(topBuyer.wallet)], topBuyer.lastT || now);
    }

    const topSeller = [...byWallet.values()].sort(function (a, b) { return b.sellUsd - a.sellUsd; })[0];
    if (topSeller && topSeller.sellUsd >= DISTRIBUTE_SELL_USD) {
      push('distribution', topSeller.sellUsd, `${shortAddr(topSeller.wallet)} distributed $${compactUsd(topSeller.sellUsd)} of $${symbol}.`, [shortAddr(topSeller.wallet)], topSeller.lastT || now);
    }

    const windowBuyers = [...byWallet.values()].filter(function (w) { return w.buyUsd >= 25 && w.buyUsd <= 1_500; });
    if (windowBuyers.length >= CLUSTER_WALLETS && buySpanMs <= CLUSTER_SPAN_MS) {
      push('cluster', totalBuy, `${windowBuyers.length} wallets bought $${symbol} inside a ${compactUsd(buySpanMs / 1000)}s window — coordinated entry, normal on hot launches.`, windowBuyers.slice(0, 3).map(function (w) { return shortAddr(w.wallet); }), now);
    }

    if (prevState && prevState.direction && prevState.direction !== direction && direction !== 'mixed') {
      const from = prevState.direction === 'acc' ? 'accumulating' : 'distributing';
      const to = direction === 'acc' ? 'accumulating' : 'distributing';
      push('rotation', null, `Net flow on $${symbol} rotated from ${from} to ${to} since the last check.`, [], now);
    }

    signals.set(c.mint, { direction, keys });
  }

  alerts.sort(function (a, b) {
    if (a.signal !== b.signal) return a.signal ? -1 : 1;
    return Date.parse(b.time) - Date.parse(a.time);
  });

  return { alerts, signals };
}

function buildMeta(count, signalCount, coverage) {
  return {
    count,
    signalCount,
    source: dataProvider,
    fetchedAt: new Date().toISOString(),
    coverage,
    askTarget: '/ask-aladdin?q=' + encodeURIComponent('Which alerts need a decision now?'),
  };
}

export async function buildAlertsResponse(limit) {
  const leaders = await fetchVolumeLeaders();
  if (leaders.length === 0) {
    return { data: [], meta: buildMeta(0, 0, 'No candidate tokens were available for alerting.') };
  }

  const pairs = await fetchPairsByMint(leaders.slice(0, 12).map(function (l) { return l.mint; }));
  const candidates = [];
  for (const leader of leaders.slice(0, 12)) {
    const pairsFor = pairs.get(leader.mint);
    if (!pairsFor) continue;
    const market = mapMarket(pairsFor);
    if (!market.marketCapUsd) continue;
    if (market.marketCapUsd < MC_MIN || market.liquidityUsd < LIQ_MIN) continue;
    const ageHours = market.launchedAt
      ? Math.max(0, (Date.now() - new Date(market.launchedAt).getTime()) / 3_600_000)
      : null;
    candidates.push({ ...leader, ageHours, market });
  }

  if (candidates.length === 0) {
    return { data: [], meta: buildMeta(0, 0, 'No tokens matched the alerting thresholds.') };
  }

  candidates.sort(function (a, b) { return (b.market.volume24h || 0) - (a.market.volume24h || 0); });
  const scanned = candidates.slice(0, MAX_CANDIDATES_SCAN);

  const rows = await fetchRecentTrades(scanned.map(function (c) { return c.mint; }));
  const byMint = new Map();
  for (const row of rows) {
    const mint = row.Trade && row.Trade.Currency && row.Trade.Currency.MintAddress;
    if (!mint) continue;
    if (!byMint.has(mint)) byMint.set(mint, []);
    const ms = Date.parse(row.Block && row.Block.Time);
    byMint.get(mint).push({
      wallet: row.Trade && row.Trade.Account && row.Trade.Account.Address,
      side: row.Trade && row.Trade.Side && row.Trade.Side.Type ? row.Trade.Side.Type.toUpperCase() === 'SELL' ? 'SELL' : 'BUY' : 'BUY',
      usd: parseFloat(row.Trade && row.Trade.AmountInUSD) || 0,
      timeMs: Number.isFinite(ms) ? ms : Date.now(),
    });
  }

  const { alerts, signals } = deriveAlertEvents(scanned, byMint, previousSignals);
  previousSignals = signals;

  const selected = alerts.slice(0, limit).map(function (a) {
    return {
      id: a.id,
      type: a.type,
      key: a.key,
      severity: a.severity,
      signal: a.signal,
      isNew: a.isNew,
      isChanged: a.isChanged,
      mint: a.mint,
      symbol: a.symbol,
      name: a.name,
      color: generateColor(a.mint),
      imageUrl: a.market.imageUrl || null,
      mc: a.mc,
      liquidity: a.liquidity,
      volume24h: a.volume24h,
      change24h: a.change24h,
      usd: a.usd,
      detail: a.detail,
      wallets: a.wallets,
      time: a.time,
      why: 'from live on-chain evidence',
    };
  });

  const coverage = `Alerts are computed from the last ${TRADE_WINDOW_MIN} minutes of sampled DEX trades on the top traded Solana pump.tokens (Bitquery) crossed with DexScreener market metrics. A proven entry is a single wallet committing $${compactUsd(PROVEN_BUY_USD)}+ in one window; early holder distribution is $${compactUsd(DISTRIBUTE_SELL_USD)}+ of net sells by one wallet; cluster activity is ${CLUSTER_WALLETS} or more wallets buying inside a ${compactUsd(CLUSTER_SPAN_MS / 1000)}s window; migration is ${MIGRATED_SHARE}%+ of volume routed on mature AMMs; momentum is ${MOMENTUM_CHANGE}%+ 24h gain on $${compactUsd(MOMENTUM_VOLUME)}+ volume. Labels describe observed-evidence behaviour, not predictions.`;

  return {
    data: selected,
    meta: buildMeta(selected.length, selected.filter(function (a) { return a.signal; }).length, coverage),
  };
}

// Last successful build's per-mint signal set, used to flag "changed" alerts.
let previousSignals = new Map();

export async function getAlertsController(req, res, next) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 30);
  try {
    const out = await dl.fetch({
      key: 'alerts:' + limit,
      feed: 'alerts',
      priority: 'user',
      freshTtlMs: 60_000,
      staleTtlMs: 10 * 60 * 1000,
      request: () => buildAlertsResponse(limit),
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
    console.error('[alerts] handler error:', exc && exc.stack ? exc.stack : exc);
    return res.status(502).json({
      error: 'upstream_unavailable',
      message: 'Live market data is temporarily unavailable. Please try again in a few minutes.',
    });
  }
}