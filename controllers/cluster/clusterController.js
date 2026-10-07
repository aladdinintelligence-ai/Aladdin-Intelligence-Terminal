import { provider as dataProvider } from '../../providers/index.js';
import dl from '../../providers/dataLayer.js';

const CANDIDATE_LIMIT = 200;
const SCAN_TOKEN_COUNT = 60;
const SCAN_GROUP_SIZE = 5;
const RECENT_ROW_LIMIT = 30000;
const MAX_SCAN_GROUPS = 12;
const RECENT_WINDOW_HOURS = 48;

// A "coordinated" co-movement: two wallets both traded the same token within
// this window of each other, on at least two distinct tokens.
const CO_WINDOW_MINUTES = 90;
const MIN_COOCCURRENCE = 2;
const MIN_CLUSTER_MEMBERS = 3;
const MAX_CLUSTER_MEMBERS = 40;
const MAX_TOKEN_CAPS = 25;
const MAX_WALLET_TOKENS = 12;

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
  const res = await dl.bitquery(query, label, { feed: 'cluster', priority: 'user' });
  if (res.error) throw new Error(res.error);
  return res;
}

function generateColor(seed) {
  let hash = 0;
  const input = String(seed);
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

function shortAddress(address) {
  return String(address || '').slice(0, 6);
}

function sinceIso(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

// Top traded meme tokens over 7d: the token universe for overlap detection.
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

  const { data } = await dlBq(query, ':cluster:leaders');

  const leaders = [];
  const seen = new Set();
  for (const row of (data && data.Solana && data.Solana.trades) || []) {
    const mint = row.Trade && row.Trade.Currency && row.Trade.Currency.MintAddress;
    if (!mint || seen.has(mint)) continue;
    seen.add(mint);
    const name = (row.Trade.Currency.Name) || '';
    leaders.push({
      mint,
      name,
      symbol: (row.Trade.Currency.Symbol) || name || mint.slice(0, 4).toUpperCase(),
      volume7d: parseFloat(row.VolumeInUSD) || 0,
    });
  }
  return leaders;
}

// Sampled recent legs per (mint, account) over the redistribution window.
async function fetchRecentTrades(mints) {
  const since = sinceIso(RECENT_WINDOW_HOURS);
  const groups = [];
  for (let i = 0; i < mints.length; i += SCAN_GROUP_SIZE) groups.push(mints.slice(i, i + SCAN_GROUP_SIZE));

  const queries = groups.slice(0, MAX_SCAN_GROUPS).map((group, idx) => {
    const groupQuoted = group.map(function (m) { return '"' + m + '"'; }).join(', ');
    const query = `{
      Solana {
        DEXTradeByTokens(
          limitBy: { by: [Trade_Currency_MintAddress, Trade_Account_Address], count: 3 }
          limit: { count: ${RECENT_ROW_LIMIT} }
          orderBy: { descending: Block_Time }
          where: {
            Trade: { Currency: { MintAddress: { in: [${groupQuoted}] } } }
            Transaction: { Result: { Success: true } }
            Block: { Time: { since: "${since}" } }
          }
        ) {
          Block { Time }
          Trade { Currency { MintAddress Symbol } Side { Type } Amount AmountInUSD }
          Transaction { FeePayer }
        }
      }
    }`;
    return dlBq(query, ':cluster:recent:' + (idx + 1)).then(function (res) {
      return (res.data && res.data.Solana && res.data.Solana.DEXTradeByTokens) || [];
    });
  });
  // Run in waves of three to stay well inside the provider's concurrent
  // session limit while other intelligence controllers are refreshing.
  const rows = [];
  for (let i = 0; i < queries.length; i += 3) {
    const wave = await Promise.all(queries.slice(i, i + 3));
    for (const batch of wave) rows.push(...batch);
  }
  return rows;
}

// wallet -> token -> sampled leg {buyUsd, sellUsd, minTime, maxTime}
function recentLegsByWallet(rows) {
  const walletTokens = new Map();
  const tokenSymbol = new Map();
  for (const row of rows) {
    const trade = row.Trade || {};
    const mint = trade.Currency && trade.Currency.MintAddress;
    const wallet = row.Transaction && row.Transaction.FeePayer;
    const side = trade.Side && trade.Side.Type;
    const usd = parseFloat(trade.AmountInUSD) || 0;
    const time = row.Block && row.Block.Time ? new Date(row.Block.Time).getTime() : null;
    if (!mint || !wallet || ROUTER_WALLETS.has(wallet) || time == null) continue;
    if (!['buy', 'sell'].includes(side)) continue;
    if (!tokenSymbol.has(mint)) tokenSymbol.set(mint, (trade.Currency.Symbol) || mint.slice(0, 4).toUpperCase());

    if (!walletTokens.has(wallet)) walletTokens.set(wallet, new Map());
    const tokens = walletTokens.get(wallet);
    if (!tokens.has(mint)) tokens.set(mint, { buyUsd: 0, sellUsd: 0, minTime: time, maxTime: time });
    const leg = tokens.get(mint);
    if (side === 'buy') leg.buyUsd += usd; else leg.sellUsd += usd;
    if (time < leg.minTime) leg.minTime = time;
    if (time > leg.maxTime) leg.maxTime = time;
  }
  return { walletTokens, tokenSymbol };
}

class UnionFind {
  constructor() {
    this.parent = new Map();
  }
  find(a) {
    if (!this.parent.has(a)) this.parent.set(a, a);
    if (this.parent.get(a) !== a) this.parent.set(a, this.find(this.parent.get(a)));
    return this.parent.get(a);
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
    return this.find(rb);
  }
  groups() {
    const out = new Map();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      if (!out.has(root)) out.set(root, []);
      out.get(root).push(key);
    }
    return out;
  }
}

function clusterStage(pressure) {
  if (pressure == null) return 'ACTIVE';
  if (pressure >= 25) return 'DISTRIBUTING';
  if (pressure <= -20) return 'ACCUMULATING';
  return 'ACTIVE';
}

function clusterWhy(t) {
  const parts = [];
  parts.push(t.walletCount + ' wallets shared ' + t.sharedTokenCount + ' tokens with '
    + t.coMovements + ' timed co-movements');
  if (t.pressure != null) {
    parts.push(t.netUsd >= 0
      ? 'net ' + formatUsd(t.netUsd) + ' sold'
      : 'net ' + formatUsd(-t.netUsd) + ' added');
  }
  parts.push('Relationship evidence does not prove common ownership');
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
    source: dataProvider,
    fetchedAt: new Date().toISOString(),
    coverage,
    askTarget: '/ask-aladdin?q=' + encodeURIComponent('Which wallets repeatedly appear together?'),
  };
}

async function buildClustersResponse(limit) {
  const leaders = await fetchVolumeLeaders();
  if (leaders.length === 0) {
    return { data: [], meta: buildMeta(0, 'No candidate tokens were available for cluster screening.') };
  }

  const scanned = leaders.slice(0, SCAN_TOKEN_COUNT);
  const rows = await fetchRecentTrades(scanned.map(function (t) { return t.mint; }));
  const { walletTokens, tokenSymbol } = recentLegsByWallet(rows);

  // Restrict coordination candidates to wallets active across ≥2 tokens.
  const multiToken = [];
  for (const [wallet, tokens] of walletTokens) {
    if (tokens.size < 2) continue;
    let activity = 0;
    for (const leg of tokens.values()) activity += leg.buyUsd + leg.sellUsd;
    multiToken.push({ wallet, tokens, activity });
    if (tokens.size > MAX_WALLET_TOKENS) {
      // Bound memory: keep the most active tokens per wallet.
      const sorted = [...tokens.keys()].sort(function (a, b) {
        return (tokens.get(b).buyUsd + tokens.get(b).sellUsd) - (tokens.get(a).buyUsd + tokens.get(a).sellUsd);
      });
      for (const key of sorted.slice(MAX_WALLET_TOKENS)) tokens.delete(key);
    }
  }
  const byWallet = new Map(multiToken.map(function (m) { return [m.wallet, m]; }));

  // Per-token capped candidate lists (top by activity), bounded for pairing.
  const tokenCandidates = new Map();
  for (const { wallet, tokens } of multiToken) {
    for (const mint of tokens.keys()) {
      if (!tokenCandidates.has(mint)) tokenCandidates.set(mint, []);
      const list = tokenCandidates.get(mint);
      list.push(wallet);
    }
  }
  for (const list of tokenCandidates.values()) {
    list.sort(function (a, b) {
      const aAct = byWallet.get(a).activity;
      const bAct = byWallet.get(b).activity;
      return bAct - aAct;
    });
    list.length = Math.min(list.length, MAX_TOKEN_CAPS);
  }

  // Candidate pairs: wallets co-listed on the same token's capped set.
  const pairInfo = new Map();
  for (const [mint, list] of tokenCandidates) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const key = a < b ? a + '|' + b : b + '|' + a;
        if (!pairInfo.has(key)) {
          pairInfo.set(key, { wallets: [a, b], shared: 0, coCount: 0 });
        }
        pairInfo.get(key).shared++;
      }
    }
  }

  // Refine pairs: exact intersection + near-simultaneous co-movement.
  const coWindow = CO_WINDOW_MINUTES * 60 * 1000;
  for (const [key, pair] of pairInfo) {
    const a = byWallet.get(pair.wallets[0]);
    const b = byWallet.get(pair.wallets[1]);
    let shared = 0;
    let coCount = 0;
    for (const [mint, legA] of a.tokens) {
      const legB = b.tokens.get(mint);
      if (!legB) continue;
      shared++;
      if (Math.abs(legA.minTime - legB.minTime) <= coWindow) coCount++;
    }
    pair.shared = shared;
    pair.coCount = coCount;
  }

  // Union-find: repeated (≥2) timed co-movements link wallets into clusters.
  const uf = new UnionFind();
  const qualifyingPairs = [];
  for (const pair of pairInfo.values()) {
    if (pair.coCount >= MIN_COOCCURRENCE) {
      uf.union(pair.wallets[0], pair.wallets[1]);
      qualifyingPairs.push(pair);
    }
  }

  const clusters = [];
  let serial = 0;
  for (const members of uf.groups().values()) {
    if (members.length < MIN_CLUSTER_MEMBERS) continue;
    // Components this large are connectivity artifacts of hot tokens and
    // bot/aggregator congestion, not wallet coordination - drop them.
    if (members.length > MAX_CLUSTER_MEMBERS) continue;
    serial++;
    const membersSet = new Set(members);
    let clusterCoMoves = 0;
    for (const pair of qualifyingPairs) {
      if (pair.coCount >= MIN_COOCCURRENCE && membersSet.has(pair.wallets[0]) && membersSet.has(pair.wallets[1])) {
        clusterCoMoves += pair.coCount;
      }
    }

    // Full-scope metrics across every token each member traded.
    const tokenParticipation = new Map();
    let buyUsd = 0;
    let sellUsd = 0;
    let firstSeen = Infinity;
    let lastSeen = 0;
    const memberRows = [];
    for (const wallet of members) {
      const row = byWallet.get(wallet);
      if (!row) continue;
      let memberTokens = 0;
      for (const [mint, leg] of row.tokens) {
        if (!tokenParticipation.has(mint)) tokenParticipation.set(mint, { count: 0, weight: 0 });
        const p = tokenParticipation.get(mint);
        p.count++;
        p.weight += leg.buyUsd + leg.sellUsd;
        memberTokens++;
        buyUsd += leg.buyUsd;
        sellUsd += leg.sellUsd;
        if (leg.minTime < firstSeen) firstSeen = leg.minTime;
        if (leg.maxTime > lastSeen) lastSeen = leg.maxTime;
      }
      memberRows.push({ wallet, tokenCount: memberTokens });
    }

    const sharedTokens = [];
    for (const [mint, p] of tokenParticipation) {
      if (p.count >= 2) sharedTokens.push({ mint, participants: p.count, weight: p.weight });
    }
    sharedTokens.sort(function (a, b) { return b.participants - a.participants || b.weight - a.weight; });

    const topTokens = sharedTokens.slice(0, 3).map(function (t) {
      return { mint: t.mint, symbol: tokenSymbol.get(t.mint) || t.mint.slice(0, 4).toUpperCase() };
    });

    memberRows.sort(function (a, b) { return b.tokenCount - a.tokenCount; });

    const net = sellUsd - buyUsd;
    const pressure = buyUsd + sellUsd > 0 ? ((sellUsd - buyUsd) / (buyUsd + sellUsd)) * 100 : null;
    const now = Date.now();
    const isNew = firstSeen > now - 24 * 3600 * 1000;
    const isChanged = lastSeen > now - 6 * 3600 * 1000;
    const signal = pressure != null && Math.abs(pressure) >= 40 && sharedTokens.length >= 2;
    const highSignal = signal && members.length >= 4 && sharedTokens.length >= 3;

    const cluster = {
      id: 'cluster-' + serial,
      name: 'Cluster ' + serial,
      color: generateColor('cluster-' + serial + '-' + members.length),
      walletCount: members.length,
      tokenCount: tokenParticipation.size,
      sharedTokenCount: sharedTokens.length,
      coMovements: clusterCoMoves,
      members: memberRows.slice(0, 6).map(function (m) {
        return { id: shortAddress(m.wallet), address: m.wallet, tokenCount: m.tokenCount };
      }),
      topTokens,
      representativeMint: topTokens[0] ? topTokens[0].mint : scanned[0].mint,
      representativeSymbol: topTokens[0] ? topTokens[0].symbol : scanned[0].symbol,
      netUsd: Math.round(net),
      pressure: pressure != null ? Math.round(pressure) : null,
      buyUsd: Math.round(buyUsd),
      sellUsd: Math.round(sellUsd),
      firstSeen: new Date(firstSeen).toISOString(),
      lastSeen: new Date(lastSeen).toISOString(),
      stage: clusterStage(pressure),
      signal,
      isNew,
      isChanged,
      highSignal,
      why: '',
    };
    cluster.why = clusterWhy(cluster);
    clusters.push(cluster);
  }

  // Strongest, most-connected clusters first.
  clusters.sort(function (a, b) {
    const ap = a.pressure != null ? Math.abs(a.pressure) : 0;
    const bp = b.pressure != null ? Math.abs(b.pressure) : 0;
    return (bp - ap) || (b.coMovements - a.coMovements) || (b.walletCount - a.walletCount);
  });
  clusters.forEach(function (c, i) {
    c.id = 'cluster-' + (i + 1);
    c.name = 'Cluster ' + (i + 1);
  });
  const selected = clusters.slice(0, limit);

  const coverage = 'Wallet clusters are detected from the last ' + RECENT_WINDOW_HOURS + 'h of DEX trades (Bitquery samples up to three '
    + 'recent legs per wallet). Wallets trading the same token within a ' + CO_WINDOW_MINUTES + '-minute window on at least two different '
    + 'tokens are linked; connected groups of ' + MIN_CLUSTER_MEMBERS + '-' + MAX_CLUSTER_MEMBERS + ' wallets form a cluster (larger '
    + 'connected groups are congestion artifacts and are dropped). Flow and sell pressure are measured across '
    + 'all sampled legs of cluster members. Shared timing is an observed relationship, not proof of common ownership or coordination intent.';

  return { data: selected, meta: buildMeta(selected.length, coverage) };
}

export async function getClusterController(req, res, next) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 30);
  try {
    const out = await dl.fetch({
      key: 'clusters:' + limit,
      feed: 'cluster',
      priority: 'user',
      request: () => buildClustersResponse(limit),
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
    console.error('[cluster] handler error:', exc && exc.message ? exc.message : exc);
    return res.status(502).json({
      error: 'upstream_unavailable',
      message: 'Live market data is temporarily unavailable. Please try again in a few minutes.',
    });
  }
}