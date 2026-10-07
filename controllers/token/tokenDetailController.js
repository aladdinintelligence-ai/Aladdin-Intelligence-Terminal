import { provider as dataProvider } from '../../providers/index.js';
import dl from '../../providers/dataLayer.js';

const FEED = 'tokenDetail';

// Provider queries flow through the data layer: budget gate, token bucket,
// circuit breaker, retry/backoff and per-query negative caching of permanent
// client errors (e.g. malformed mint addresses). Errors are thrown upward so
// the dl.fetch wrapper can serve stale or { unavailable }.
async function dlBq(query, label) {
  const res = await dl.bitquery(query, label, { feed: FEED, priority: 'user' });
  if (res.error) throw new Error(res.error);
  return res;
}

async function fetchTrades(mint, limit = 50) {
  const query = `{
    Solana {
      DEXTradeByTokens(
        limit: { count: ${limit} }
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
  const { data } = await dlBq(query, ':trades');

  return (data?.Solana?.DEXTradeByTokens || []).map(t => ({
    time: t.Block?.Time,
    side: t.Trade?.Side?.Type?.toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
    amount: parseFloat(t.Trade?.Amount) || 0,
    priceUsd: parseFloat(t.Trade?.PriceInUSD) || 0,
    wallet: t.Trade?.Account?.Owner || '',
    signature: t.Transaction?.Signature || '',
  }));
}

async function fetchParticipants(mint, limit = 50) {
  const query = `{
    Solana {
      DEXTradeByTokens(
        limit: { count: ${Math.min(limit * 5, 500)} }
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
  const { data } = await dlBq(query, ':participants');

  const byWallet = new Map();
  for (const t of data?.Solana?.DEXTradeByTokens || []) {
    const addr = t.Trade?.Account?.Owner;
    if (!addr) continue;
    if (!byWallet.has(addr)) {
      byWallet.set(addr, { wallet: addr, trades: 0, buys: 0, sells: 0, totalVolumeUsd: 0, firstTrade: t.Block?.Time, lastTrade: t.Block?.Time });
    }
    const w = byWallet.get(addr);
    w.trades++;
    const side = t.Trade?.Side?.Type?.toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
    if (side === 'BUY') w.buys++;
    else w.sells++;
    w.totalVolumeUsd += parseFloat(t.Trade?.PriceInUSD) || 0;
    if (t.Block?.Time < w.firstTrade) w.firstTrade = t.Block?.Time;
    if (t.Block?.Time > w.lastTrade) w.lastTrade = t.Block?.Time;
  }

  return [...byWallet.values()]
    .sort((a, b) => b.totalVolumeUsd - a.totalVolumeUsd)
    .slice(0, limit)
    .map(w => ({
      ...w,
      short: `${w.wallet.slice(0, 4)}...${w.wallet.slice(-4)}`,
      behaviour: w.buys > w.sells * 2 ? 'Buyer' : w.sells > w.buys * 2 ? 'Seller' : 'Mixed',
    }));
}

async function fetchHolders(mint, limit = 50) {
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
  const { data } = await dlBq(query, ':holders');

  const balances = new Map();
  for (const row of data?.Solana?.BalanceUpdates || []) {
    const addr = row.BalanceUpdate?.Account?.Address;
    const bal = parseFloat(row.BalanceUpdate?.PostBalance) || 0;
    if (addr && bal > 0) balances.set(addr, bal);
  }

  const total = [...balances.values()].reduce((s, v) => s + v, 0);
  return [...balances.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([addr, bal], i) => ({
      rank: i + 1,
      wallet: addr,
      short: `${addr.slice(0, 4)}...${addr.slice(-4)}`,
      balance: bal,
      supplyPct: total > 0 ? ((bal / total) * 100).toFixed(2) : '0',
    }));
}

async function fetchFirstBuyers(mint, limit = 100) {
  const query = `{
    Solana {
      DEXTradeByTokens(
        limit: { count: ${Math.min(limit * 3, 500)} }
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
  const { data } = await dlBq(query, ':firstBuyers');

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
    if (buyers.length >= limit) break;
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
  const { data } = await dlBq(query, ':stats');

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

async function buildTab(tab, mint, limit) {
  let data;
  switch (tab) {
    case 'trades':
      data = await fetchTrades(mint, limit);
      break;
    case 'participants':
      data = await fetchParticipants(mint, limit);
      break;
    case 'holders':
      data = await fetchHolders(mint, limit);
      break;
    case 'first-buyers':
      data = await fetchFirstBuyers(mint, limit);
      break;
    case 'stats':
      data = await fetchTokenStats(mint);
      break;
    default:
      throw new Error('Invalid tab: ' + tab);
  }

  return {
    data,
    meta: { mint, tab, count: Array.isArray(data) ? data.length : 1, source: dataProvider, fetchedAt: new Date().toISOString() },
  };
}

const TABS = new Set(['trades', 'participants', 'holders', 'first-buyers', 'stats']);

export async function getTokenDetailController(req, res, next) {
  const { mint } = req.params;
  const tab = req.query.tab || 'trades';
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);

  if (!TABS.has(tab)) {
    return res.status(400).json({ error: `Invalid tab: ${tab}` });
  }

  try {
    const out = await dl.fetch({
      key: `detail:${mint}:${tab}:${limit}`,
      feed: FEED,
      priority: 'user',
      freshTtlMs: 45_000,
      request: () => buildTab(tab, mint, limit),
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
    console.error('[tokenDetail] handler error:', exc && exc.message ? exc.message : exc);
    return res.status(502).json({
      error: 'upstream_unavailable',
      message: 'Live market data is temporarily unavailable. Please try again in a few minutes.',
    });
  }
}