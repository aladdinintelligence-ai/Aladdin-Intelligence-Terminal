// Per-wallet trade-behaviour labels for the live transactions tab.
//
// Every rule only needs signals already present in one DEXTradeByTokens
// snapshot (side, amount, time, wallet), so annotating a trade never triggers
// another upstream call. Wallets that match a signature return one of Aladdin's
// Behaviour identities (Creator / Cluster Wallet / Scalper / Migration
// Specialist / Fresh Wallet / Bundle Specialist, ...); everyone else degrades
// to a directional label (Buyer / Seller / Mixed) like the Participants tab.
//
// The labels are honest derived-behaviour from the observed window, not a
// permanent identity claim: a wallet can be a "Fresh Wallet" here and a
// different signature on another token.
const SAME_SIZE_RATIO = 1.03;
const CLUSTER_SPAN_MS = 120 * 1000;
const BUNDLE_SPAN_MS = 10 * 1000;
const FRESH_USD_CAP = 100;
const EARLY_ENTRY_FRACTION = 0.15;

// Smallest time-window (ms) holding at least three buys whose amounts are all
// near-identical — the sleeve-identical-orders pattern shared by cluster
// wallets. Returns Infinity when no such window exists.
function tripleSpan(buyTimesMs, buyAmounts, sameSizeOnly) {
  const n = buyTimesMs ? buyTimesMs.length : 0;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        if (sameSizeOnly && buyAmounts) {
          const lo = Math.min(buyAmounts[i], buyAmounts[j], buyAmounts[k]);
          const hi = Math.max(buyAmounts[i], buyAmounts[j], buyAmounts[k]);
          if (lo <= 0 || hi / lo > SAME_SIZE_RATIO) continue;
        }
        const span = Math.max(buyTimesMs[i], buyTimesMs[j], buyTimesMs[k])
          - Math.min(buyTimesMs[i], buyTimesMs[j], buyTimesMs[k]);
        if (span < best) best = span;
      }
    }
  }
  return best;
}

export function clusterSpanMs(buyTimesMs, buyAmounts) {
  return tripleSpan(buyTimesMs, buyAmounts, true);
}

export function tightBurstSpanMs(buyTimesMs) {
  return tripleSpan(buyTimesMs, null, false);
}

// group = { wallet, buys, sells, usdIn, firstT, lastT, buyTimesMs, buyAmounts }
export function behaviourForWallet(group, creator, snapshotStartMs) {
  const { wallet, buys, sells, usdIn, firstT, lastT, buyTimesMs, buyAmounts } = group;
  const count = buys + sells;

  if (creator && wallet === creator) return 'Creator';

  if (buys >= 3 && clusterSpanMs(buyTimesMs, buyAmounts) <= CLUSTER_SPAN_MS) return 'Cluster Wallet';

  if (count <= 2 && usdIn <= FRESH_USD_CAP) return 'Fresh Wallet';

  if (buys >= 2 && sells >= 2) return 'Scalper';

  if (buys >= 3 && sells === 0 && tightBurstSpanMs(buyTimesMs) <= BUNDLE_SPAN_MS) return 'Bundle Specialist';

  if (buys >= 2 && sells >= 1 && snapshotStartMs != null && firstT != null) {
    const horizon = lastT != null ? lastT : snapshotStartMs;
    const window = horizon - snapshotStartMs;
    if (window > 0 && firstT - snapshotStartMs <= window * EARLY_ENTRY_FRACTION) return 'Migration Specialist';
  }

  if (sells === 0) return 'Buyer';
  if (buys === 0) return 'Seller';
  return 'Mixed';
}

function timeMs(t) {
  const ms = typeof t === 'number' ? t : Date.parse(t || '');
  return Number.isFinite(ms) ? ms : null;
}

// Enriches a trades array (as returned by fetchTrades) so every row carries a
// `behaviour` label for the wallet behind it. Returns a new array.
export function annotateTradesWithBehaviour(trades, creator) {
  const groups = new Map();

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    if (!t.wallet) continue;
    let g = groups.get(t.wallet);
    if (!g) {
      g = { wallet: t.wallet, buys: 0, sells: 0, usdIn: 0, firstT: null, lastT: null, buyTimesMs: [], buyAmounts: [] };
      groups.set(t.wallet, g);
    }
    const ms = timeMs(t.time);
    if (t.side === 'BUY') {
      g.buys += 1;
      g.usdIn += t.amountUsd != null ? t.amountUsd : (t.amount || 0) * (t.priceUsd || 0);
      if (ms != null) g.buyTimesMs.push(ms);
      if (t.amount != null) g.buyAmounts.push(t.amount);
    } else {
      g.sells += 1;
    }
    if (ms != null) {
      if (g.firstT == null || ms < g.firstT) g.firstT = ms;
      if (g.lastT == null || ms > g.lastT) g.lastT = ms;
    }
  }

  if (groups.size === 0) return trades;

  let snapshotStartMs = Infinity;
  for (const g of groups.values()) {
    if (g.firstT != null && g.firstT < snapshotStartMs) snapshotStartMs = g.firstT;
  }
  if (!Number.isFinite(snapshotStartMs)) snapshotStartMs = null;

  const behaviourByWallet = new Map();
  for (const g of groups.values()) {
    behaviourByWallet.set(g.wallet, behaviourForWallet(g, creator, snapshotStartMs));
  }

  return trades.map((t) =>
    t.wallet && behaviourByWallet.has(t.wallet)
      ? { ...t, behaviour: behaviourByWallet.get(t.wallet) }
      : t
  );
}