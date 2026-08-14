export function asList(payload) {
  if (Array.isArray(payload)) return payload.filter(item => item && typeof item === 'object');
  if (payload && typeof payload === 'object') {
    for (const key of ['data', 'items', 'trades', 'holders', 'wallets', 'result']) {
      const value = payload[key];
      if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object');
    }
  }
  return [];
}

export function pickNumber(item, ...keys) {
  for (const key of keys) {
    const value = item[key];
    if (value === null || value === undefined || value === '') continue;
    const num = Number(value);
    if (!isNaN(num)) return num;
  }
  return null;
}

export function pickString(item, ...keys) {
  for (const key of keys) {
    const value = item[key];
    if (value !== null && value !== undefined && value !== '') return String(value);
  }
  return null;
}

export function normalizeSide(item) {
  const raw = pickString(item, 'side', 'type', 'transactionType', 'swapType') || 'unknown';
  const lower = raw.toLowerCase();
  if (lower.includes('buy')) return 'buy';
  if (lower.includes('sell')) return 'sell';
  return lower.slice(0, 16);
}

export function summarizeTokenFeatures(trades, holdersCount = null) {
  const buyers = new Set();
  const sellers = new Set();
  let buyCount = 0;
  let sellCount = 0;
  for (const trade of trades) {
    const wallet = pickString(trade, 'wallet_address', 'wallet', 'owner', 'trader', 'walletAddress', 'address');
    const side = normalizeSide(trade);
    if (side === 'buy') {
      buyCount++;
      if (wallet) buyers.add(wallet);
    } else if (side === 'sell') {
      sellCount++;
      if (wallet) sellers.add(wallet);
    }
  }
  const ratio = sellCount === 0 ? null : buyCount / sellCount;
  return { uniqueBuyers: buyers.size, uniqueSellers: sellers.size, buySellRatio: ratio, holderCount: holdersCount };
}
