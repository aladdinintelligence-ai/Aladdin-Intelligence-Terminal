import crypto from 'crypto';
import { Trade, WalletTokenEpisode } from '../models/index.js';

function stableId(...parts) {
  return crypto.createHash('sha256').update(parts.map(p => String(p || '')).join('|')).digest('hex');
}

function sumValues(values) {
  return values.reduce((acc, v) => acc + Number(v || 0), 0);
}

function secondsBetween(later, earlier) {
  if (!later || !earlier) return null;
  return Math.floor((new Date(later).getTime() - new Date(earlier).getTime()) / 1000);
}

function persistEpisode(tokenMint, wallet, episodeIndex, episodeTrades, now) {
  const buys = episodeTrades.filter(r => r.side === 'buy');
  const sells = episodeTrades.filter(r => r.side === 'sell');
  const buyTimes = buys.filter(r => r.blockTime).map(r => new Date(r.blockTime));
  const sellTimes = sells.filter(r => r.blockTime).map(r => new Date(r.blockTime));
  const allTimes = episodeTrades.filter(r => r.blockTime).map(r => new Date(r.blockTime));

  const firstBuyAt = buyTimes.length ? new Date(Math.min(...buyTimes)) : null;
  const lastBuyAt = buyTimes.length ? new Date(Math.max(...buyTimes)) : null;
  const firstSellAt = sellTimes.length ? new Date(Math.min(...sellTimes)) : null;
  const lastSellAt = sellTimes.length ? new Date(Math.max(...sellTimes)) : null;
  const openedAt = firstBuyAt || (allTimes.length ? new Date(Math.min(...allTimes)) : null);

  const boughtToken = sumValues(buys.map(r => r.tokenAmount));
  const soldToken = sumValues(sells.map(r => r.tokenAmount));
  const remaining = boughtToken - soldToken;
  const boughtSol = sumValues(buys.map(r => r.solAmount));
  const soldSol = sumValues(sells.map(r => r.solAmount));

  const isClosed = boughtToken > 0 && remaining <= 0;
  const isPartial = boughtToken > 0 && soldToken > 0 && remaining > 0;
  const status = isClosed ? 'closed' : isPartial ? 'partial' : buys.length ? 'open' : 'unknown';
  const closedAt = isClosed ? lastSellAt : null;

  const entryMarketCap = buys.find(r => r.marketCapUsd != null)?.marketCapUsd || null;
  const exitMarketCapReversed = sells.slice().reverse().find(r => r.marketCapUsd != null)?.marketCapUsd || null;

  const id = stableId(wallet, tokenMint, episodeIndex);
  return {
    _id: id, walletAddress: wallet, tokenMint, episodeIndex,
    openedAt, closedAt, firstBuyAt, lastBuyAt, firstSellAt, lastSellAt,
    entryMarketCapUsd: entryMarketCap, exitMarketCapUsd: exitMarketCapReversed,
    boughtTokenAmount: boughtToken, soldTokenAmount: soldToken, remainingTokenAmount: remaining,
    boughtSol, soldSol,
    holdingDurationSeconds: secondsBetween(closedAt, openedAt),
    holdingDurationSoFar: openedAt && !closedAt ? secondsBetween(now, openedAt) : null,
    durationCensored: closedAt === null,
    episodeStatus: status, coverageStatus: 'partial', calculationVersion: 'episode_v1', computedAt: now,
  };
}

export async function materializeTokenEpisodes(tokenMint, asOf = null) {
  const now = asOf || new Date();
  const trades = await Trade.find({ tokenMint }).sort({ walletAddress: 1, blockTime: 1 }).lean();
  const grouped = {};
  for (const row of trades) {
    if (!grouped[row.walletAddress]) grouped[row.walletAddress] = [];
    grouped[row.walletAddress].push(row);
  }

  let created = 0;
  for (const [wallet, walletTrades] of Object.entries(grouped)) {
    let current = [];
    let currentRemaining = 0;
    let episodeIndex = 1;

    for (const trade of walletTrades) {
      const side = trade.side;
      const amount = Number(trade.tokenAmount || 0);
      if (side === 'buy' && currentRemaining <= 0 && current.length > 0) {
        const doc = persistEpisode(tokenMint, wallet, episodeIndex, current, now);
        await WalletTokenEpisode.findOneAndUpdate(
          { walletAddress: wallet, tokenMint, episodeIndex },
          { $set: doc },
          { upsert: true }
        );
        created++;
        episodeIndex++;
        current = [];
        currentRemaining = 0;
      }
      current.push(trade);
      if (side === 'buy') currentRemaining += amount;
      else if (side === 'sell') currentRemaining -= amount;
      if (currentRemaining <= 0 && current.length > 0) {
        const doc = persistEpisode(tokenMint, wallet, episodeIndex, current, now);
        await WalletTokenEpisode.findOneAndUpdate(
          { walletAddress: wallet, tokenMint, episodeIndex },
          { $set: doc },
          { upsert: true }
        );
        created++;
        episodeIndex++;
        current = [];
        currentRemaining = 0;
      }
    }
    if (current.length > 0) {
      const doc = persistEpisode(tokenMint, wallet, episodeIndex, current, now);
      await WalletTokenEpisode.findOneAndUpdate(
        { walletAddress: wallet, tokenMint, episodeIndex },
        { $set: doc },
        { upsert: true }
      );
      created++;
    }
  }
  return { episodes: created };
}
