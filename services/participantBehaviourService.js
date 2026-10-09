// Wallet behaviour classification for the Participants tab.
//
// Labels are behaviour-based, not permanent: a wallet can be a "Fresh Wallet"
// on one token and a "Scalper" on another. Creator status is the only
// token-specific label — it travels with the address that created this
// particular token, wherever it trades.
//
// Priority:
//   1. Creator Wallet   — the address that created the analysed token.
//   2. Fresh Wallet     — fewer than FRESH_TRADE_MIN trades. Wallets that
//                         reach that threshold are reclassified by the
//                         dominant pattern in their trade history.
//   3. Migration Specialist — repeatedly buys before migration, sells after:
//                         average sell time is well after average buy time.
//   4. Scalper           — repeatedly buys and sells within short holding
//                         periods, regardless of profit or loss.
//   5. Unknown Wallet    — no dominant pattern could be identified.
const FRESH_TRADE_MIN = 2;
const MIG_SPEC_MIN_GAP_MS = 30 * 60 * 1000;
const SCALPER_MAX_HOLD_MS = 15 * 60 * 1000;

export const PARTICIPANT_BEHAVIOUR_ORDER = [
  'Migration Specialist',
  'Scalper',
  'Fresh Wallet',
  'Creator Wallet',
  'Unknown Wallet',
];

function meanMs(values) {
  if (!values || !values.length) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

// Pairs each sell with the most recent earlier buy and returns the median
// holding period in ms between the pairs, or null when no pair exists (e.g. a
// wallet that only ever bought or only ever sold).
function medianHoldMs(buys, sells) {
  const b = [...buys].sort((x, y) => x - y);
  const s = [...sells].sort((x, y) => x - y);
  const holds = [];
  for (const t of s) {
    let i = b.length - 1;
    while (i >= 0 && b[i] > t) i--;
    if (i < 0) continue;
    holds.push(t - b[i]);
    b.splice(i, 1);
  }
  if (!holds.length) return null;
  holds.sort((x, y) => x - y);
  const mid = Math.floor(holds.length / 2);
  return holds.length % 2 ? holds[mid] : (holds[mid - 1] + holds[mid]) / 2;
}

// group = { wallet, buys, sells, buyTimesMs, sellTimesMs }
export function classifyParticipant(group, creator) {
  const { wallet, buys, sells } = group;
  const times = group.buyTimesMs || [];
  const sellTimes = group.sellTimesMs || [];

  if (creator && wallet === creator) return 'Creator Wallet';

  if (buys + sells < FRESH_TRADE_MIN) return 'Fresh Wallet';

  if (buys >= 2 && sells >= 2) {
    const meanBuy = meanMs(times);
    const meanSell = meanMs(sellTimes);
    if (
      meanBuy != null &&
      meanSell != null &&
      meanSell - meanBuy >= MIG_SPEC_MIN_GAP_MS
    ) {
      return 'Migration Specialist';
    }
    const hold = medianHoldMs(times, sellTimes);
    if (hold != null && hold <= SCALPER_MAX_HOLD_MS) return 'Scalper';
  }

  return 'Unknown Wallet';
}

// Annotates per-wallet rows with their behaviour label.
export function annotateWallets(wallets, creator) {
  return wallets.map((w) => ({ ...w, behaviour: classifyParticipant(w, creator) }));
}

// Groups wallets into behaviour buckets so the tab can render a summary:
// one row per behaviour with the wallet count and the totals for buys/sells.
// Every label is always present so the UI can show "- - -" when a behaviour
// has no wallets on the token yet.
export function groupParticipants(wallets, creator) {
  const buckets = new Map();
  for (const w of wallets) {
    const label = classifyParticipant(w, creator);
    const bucket = buckets.get(label) || { behaviour: label, wallets: 0, buys: 0, sells: 0 };
    bucket.wallets += 1;
    bucket.buys += w.buys || 0;
    bucket.sells += w.sells || 0;
    buckets.set(label, bucket);
  }
  return PARTICIPANT_BEHAVIOUR_ORDER.map((label) => buckets.get(label) || { behaviour: label, wallets: 0, buys: 0, sells: 0 });
}