import crypto from 'crypto';
import {
  Token, Wallet, Trade, WalletTokenPosition, TokenHolder, TokenLifecycle,
  TokenFeature, WalletTokenFeature, WalletBehaviourIdentity, ProviderRawSnapshot,
} from '../models/index.js';
import { fetchTokenSummary, fetchTokenTrades, fetchFirstBuyers, fetchProfitableTraders, fetchTokenHolders, fetchTokenRoles } from '../providers/solanaTracker.js';
import { asList, pickNumber, pickString, normalizeSide, summarizeTokenFeatures } from './features.js';
import * as behaviourService from './behaviourService.js';
import { materializeDisplayCohorts } from './cohortService.js';
import { materializeTokenEpisodes } from './episodeService.js';
import { upsertTokenRole } from './roleService.js';

function stableId(...parts) {
  return crypto.createHash('sha256').update(parts.map(p => String(p || '')).join('|')).digest('hex');
}

async function recordProviderSnapshot(result, targetType, targetId, snapshotType, normalizationVersion = 'normalizer_v1') {
  const payloadText = JSON.stringify(result.payload, Object.keys(result.payload || {}).sort());
  const payloadHash = crypto.createHash('sha256').update(payloadText).digest('hex');
  const id = stableId(result.provider, targetType, targetId, snapshotType, payloadHash);
  const doc = {
    _id: id, provider: result.provider, targetType, targetId, snapshotType,
    method: result.method, requestId: result.requestId, requestParams: result.params,
    payloadHash, payload: result.payload, providerVersion: result.providerVersion,
    normalizationVersion, coverage: result.coverage, qualityStatus: result.qualityStatus,
    errorMetadata: result.error ? { error: result.error } : null, fetchedAt: result.fetchedAt,
  };
  await ProviderRawSnapshot.findOneAndUpdate(
    { provider: result.provider, targetType, targetId, snapshotType, payloadHash },
    { $set: doc },
    { upsert: true }
  );
  return id;
}

function normalizeTokenPayload(mint, payload, snapshotId = null, qualityStatus = 'partial') {
  const root = payload && typeof payload === 'object' ? payload : {};
  const tokenData = root.token && typeof root.token === 'object' ? root.token : root;
  const pools = Array.isArray(root.pools) ? root.pools : [];
  const primaryPool = pools[0] && typeof pools[0] === 'object' ? pools[0] : {};
  const decimals = pickNumber(tokenData, 'decimals');
  const rawLaunch = root.launchTimestamp || root.createdAt || root.created_at;
  const launchTimestamp = typeof rawLaunch === 'number' ? new Date(rawLaunch * 1000) : null;
  return {
    _id: mint, name: pickString(tokenData, 'name'), symbol: pickString(tokenData, 'symbol'),
    imageUrl: pickString(tokenData, 'image', 'image_url', 'imageUrl'),
    metadataUri: pickString(tokenData, 'uri', 'metadataUri', 'metadata_uri'),
    creator: pickString(root, 'creator', 'developer', 'deployer'), launchTimestamp,
    decimals: decimals != null ? Math.floor(decimals) : null,
    supply: pickNumber(tokenData, 'supply', 'totalSupply'),
    marketCapUsd: pickNumber(primaryPool, 'marketCap', 'market_cap_usd', 'marketCapUsd') || pickNumber(root, 'marketCap'),
    liquidityUsd: pickNumber(primaryPool, 'liquidity', 'liquidityUsd') || pickNumber(root, 'liquidity'),
    priceUsd: pickNumber(primaryPool, 'price', 'priceUsd') || pickNumber(root, 'price', 'priceUsd'),
    volumeUsd: pickNumber(root, 'volumeUsd', 'volume_usd', 'volume'),
    holders: pickNumber(root, 'holders', 'holderCount'),
    buys: pickNumber(root, 'buys', 'buyCount'),
    sells: pickNumber(root, 'sells', 'sellCount'),
    migrationState: pickString(root, 'migrationState', 'status') || 'unknown',
    migrationProgress: pickNumber(root, 'migrationProgress', 'curvePercentage', 'progress'),
    providerSnapshotId: snapshotId, providerPayload: payload, qualityStatus,
  };
}

function normalizeTradePayload(mint, item, snapshotId = null, qualityStatus = 'partial') {
  const signature = pickString(item, 'tx', 'txHash', 'signature', 'transaction', 'transactionSignature');
  const wallet = pickString(item, 'wallet', 'owner', 'trader', 'walletAddress', 'address');
  const side = normalizeSide(item);
  if (!signature || !wallet || !['buy', 'sell'].includes(side)) return null;
  const rawTime = item.timestamp || item.blockTime || item.time;
  const blockTime = typeof rawTime === 'number' ? new Date(rawTime * 1000) : null;
  return {
    _id: stableId(mint, signature, wallet, side),
    tokenMint: mint, walletAddress: wallet, transactionSignature: signature, side, blockTime,
    slot: item.slot != null ? Number(item.slot) : null,
    solAmount: pickNumber(item, 'solAmount', 'sol_amount', 'amountSol'),
    usdAmount: pickNumber(item, 'usdAmount', 'usd', 'valueUsd'),
    tokenAmount: pickNumber(item, 'tokenAmount', 'amount', 'tokens'),
    priceUsd: pickNumber(item, 'priceUsd', 'price_usd', 'price'),
    marketCapUsd: pickNumber(item, 'marketCap', 'market_cap_usd', 'marketCapUsd'),
    providerSnapshotId: snapshotId, providerPayload: item, qualityStatus,
  };
}

function normalizeWalletPosition(mint, item, rank = null, snapshotId = null, qualityStatus = 'partial') {
  const wallet = pickString(item, 'wallet', 'owner', 'trader', 'walletAddress', 'address');
  if (!wallet) return null;
  return {
    _id: stableId(wallet, mint), walletAddress: wallet, tokenMint: mint,
    buyCount: Number(pickNumber(item, 'buyCount', 'buys', 'buy_count') || 0),
    sellCount: Number(pickNumber(item, 'sellCount', 'sells', 'sell_count') || 0),
    boughtSol: pickNumber(item, 'boughtSol', 'totalBoughtSol', 'bought_sol'),
    soldSol: pickNumber(item, 'soldSol', 'totalSoldSol', 'sold_sol'),
    realisedPnlUsd: pickNumber(item, 'realizedPnlUsd', 'realisedPnlUsd', 'pnlUsd', 'realised_pnl_usd'),
    unrealisedPnlUsd: pickNumber(item, 'unrealizedPnlUsd', 'unrealisedPnlUsd', 'unrealised_pnl_usd'),
    roiPct: pickNumber(item, 'roi', 'roiPct', 'roi_pct'),
    remainingPct: pickNumber(item, 'remaining', 'remainingPct', 'remaining_pct'),
    costBasisStatus: pickString(item, 'costBasisStatus', 'cost_basis_status') || (pickNumber(item, 'realizedPnlUsd', 'realisedPnlUsd', 'pnlUsd') != null ? 'complete' : 'unavailable'),
    providerSnapshotId: snapshotId, providerPayload: item, qualityStatus, entryRank: rank,
  };
}

function normalizeHolder(mint, item, snapshotId = null, qualityStatus = 'partial') {
  const wallet = pickString(item, 'wallet', 'owner', 'address', 'walletAddress');
  if (!wallet) return null;
  const now = new Date();
  return {
    _id: stableId(mint, wallet, 'holder'), tokenMint: mint, walletAddress: wallet,
    supply: pickNumber(item, 'amount', 'balance', 'supply'),
    supplyPct: pickNumber(item, 'supplyPct', 'supply_pct', 'percentage'),
    usdValue: pickNumber(item, 'valueUsd', 'usdValue', 'usd_value'),
    soldRemainingPct: pickNumber(item, 'remainingPct', 'remaining_pct'),
    firstObservedAt: now, lastObservedAt: now,
    providerSnapshotId: snapshotId, providerPayload: item, qualityStatus,
  };
}

function extractRoleRows(payload) {
  const root = payload && typeof payload === 'object' ? payload : {};
  const mapping = { creator: 'creator', creators: 'creator', insider: 'insider', insiders: 'insider', bundler: 'bundler', bundlers: 'bundler', sniper: 'sniper', snipers: 'sniper' };
  const rows = [];
  for (const [sourceKey, role] of Object.entries(mapping)) {
    let values = root[sourceKey];
    if (typeof values === 'string') values = [values];
    if (Array.isArray(values)) {
      for (const value of values) {
        const wallet = value && typeof value === 'object' ? value.wallet : value;
        if (wallet) rows.push({ wallet: String(wallet), role });
      }
    }
  }
  return rows;
}

async function materializeFeaturesAndCohorts(mint, entryRanks = {}) {
  const tradeRows = await Trade.find({ tokenMint: mint }).lean();
  const holderCount = await TokenHolder.countDocuments({ tokenMint: mint });
  const summary = summarizeTokenFeatures(tradeRows, holderCount);
  await TokenFeature.findOneAndUpdate({ _id: mint }, { $set: { ...summary, qualityStatus: 'partial' } }, { upsert: true });

  const existingPositions = await WalletTokenPosition.find({ tokenMint: mint }).select('walletAddress').lean();
  const existingPositionWallets = new Set(existingPositions.map(p => p.walletAddress));
  const tradeWallets = new Set(tradeRows.map(r => r.walletAddress));

  for (const wallet of tradeWallets) {
    if (existingPositionWallets.has(wallet)) continue;
    const buyCount = await Trade.countDocuments({ tokenMint: mint, walletAddress: wallet, side: 'buy' });
    const sellCount = await Trade.countDocuments({ tokenMint: mint, walletAddress: wallet, side: 'sell' });
    const buyAgg = await Trade.aggregate([
      { $match: { tokenMint: mint, walletAddress: wallet, side: 'buy' } },
      { $group: { _id: null, total: { $sum: { $toDouble: { $ifNull: ['$solAmount', '0'] } } } } },
    ]);
    const sellAgg = await Trade.aggregate([
      { $match: { tokenMint: mint, walletAddress: wallet, side: 'sell' } },
      { $group: { _id: null, total: { $sum: { $toDouble: { $ifNull: ['$solAmount', '0'] } } } } },
    ]);
    await WalletTokenPosition.findOneAndUpdate(
      { walletAddress: wallet, tokenMint: mint },
      { $set: {
        _id: stableId(wallet, mint), buyCount, sellCount,
        boughtSol: buyAgg[0]?.total || 0, soldSol: sellAgg[0]?.total || 0,
        costBasisStatus: 'unavailable', qualityStatus: 'partial',
      }},
      { upsert: true }
    );
  }

  const positionRows = await WalletTokenPosition.find({ tokenMint: mint }).lean();
  for (const row of positionRows) {
    const firstTrade = await Trade.findOne({ tokenMint: mint, walletAddress: row.walletAddress }).sort({ blockTime: 1 }).select('blockTime').lean();
    const lastTrade = await Trade.findOne({ tokenMint: mint, walletAddress: row.walletAddress }).sort({ blockTime: -1 }).select('blockTime').lean();
    await WalletTokenPosition.findByIdAndUpdate(row._id, { firstTradeAt: firstTrade?.blockTime, lastTradeAt: lastTrade?.blockTime });

    await WalletTokenFeature.findOneAndUpdate(
      { walletAddress: row.walletAddress, tokenMint: mint },
      { $set: {
        _id: stableId(row.walletAddress, mint, 'features'),
        entryRank: entryRanks[row.walletAddress] || null,
        amountBoughtSol: row.boughtSol, amountSoldSol: row.soldSol,
        remainingPct: row.remainingPct, realisedPnlUsd: row.realisedPnlUsd, roiPct: row.roiPct,
        buyCount: row.buyCount, sellCount: row.sellCount, qualityStatus: row.qualityStatus,
      }},
      { upsert: true }
    );
  }

  const episodeStats = await materializeTokenEpisodes(mint);
  await behaviourService.ensureDefinitions();
  const uniqueWallets = new Set([...tradeRows.map(r => r.walletAddress), ...positionRows.map(r => r.walletAddress)]);
  for (const wallet of uniqueWallets) {
    await Wallet.findOneAndUpdate({ _id: wallet }, { $set: { _id: wallet } }, { upsert: true });
    const existingIdentity = await WalletBehaviourIdentity.findById(wallet).lean();
    if (!existingIdentity) {
      await behaviourService.setIdentityFromEvidence(wallet, { qualityStatus: 'unavailable', episodesObserved: 0, tokensObserved: 0, coveragePct: 0, evidenceStrength: 0 });
    }
  }

  const cohortRows = await materializeDisplayCohorts(mint);
  const lastTrade = await Trade.findOne({ tokenMint: mint }).sort({ blockTime: -1 }).select('blockTime').lean();
  await TokenLifecycle.findOneAndUpdate(
    { _id: mint },
    { $set: { stage: 'unknown', lastTradeAt: lastTrade?.blockTime, qualityStatus: 'partial' } },
    { upsert: true }
  );
  return { tokenFeatures: 1, episodes: episodeStats.episodes, displayCohorts: cohortRows.length };
}

export async function syncToken(mint, tradeLimit = 100, holderLimit = 100) {
  const [tokenResult, tradesResult, firstBuyersResult, tradersResult, holdersResult, rolesResult] = await Promise.all([
    fetchTokenSummary(mint),
    fetchTokenTrades(mint, tradeLimit),
    fetchFirstBuyers(mint, 100),
    fetchProfitableTraders(mint, 100),
    fetchTokenHolders(mint, holderLimit),
    fetchTokenRoles(mint),
  ]);

  const results = [tokenResult, tradesResult, firstBuyersResult, tradersResult, holdersResult, rolesResult];
  if (tokenResult.error) throw new Error(`Provider unavailable for token summary: ${tokenResult.error}`);

  const tokenSnapshotId = await recordProviderSnapshot(tokenResult, 'token', mint, 'token');
  const tradesSnapshotId = await recordProviderSnapshot(tradesResult, 'token', mint, 'trades');
  const firstBuyersSnapshotId = await recordProviderSnapshot(firstBuyersResult, 'token', mint, 'first_buyers');
  const tradersSnapshotId = await recordProviderSnapshot(tradersResult, 'token', mint, 'profitable_traders');
  const holdersSnapshotId = await recordProviderSnapshot(holdersResult, 'token', mint, 'holders');
  const rolesSnapshotId = await recordProviderSnapshot(rolesResult, 'token', mint, 'roles');

  const tokenValues = normalizeTokenPayload(mint, tokenResult.payload, tokenSnapshotId, tokenResult.qualityStatus);
  await Token.findOneAndUpdate({ _id: mint }, { $set: tokenValues }, { upsert: true });

  let tradeCount = 0;
  for (const item of asList(tradesResult.payload)) {
    const trade = normalizeTradePayload(mint, item, tradesSnapshotId, tradesResult.qualityStatus);
    if (!trade) continue;
    await Wallet.findOneAndUpdate({ _id: trade.walletAddress }, { $set: { lastSeenAt: trade.blockTime } }, { upsert: true });
    await Trade.findOneAndUpdate(
      { tokenMint: mint, transactionSignature: trade.transactionSignature, walletAddress: trade.walletAddress, side: trade.side },
      { $set: trade },
      { upsert: true }
    );
    tradeCount++;
  }

  const entryRanks = {};
  let positionsCount = 0;
  const firstBuyersItems = asList(firstBuyersResult.payload).map((item, i) => ({ item, rank: i + 1, snapshotId: firstBuyersSnapshotId, quality: firstBuyersResult.qualityStatus }));
  const tradersItems = asList(tradersResult.payload).map(item => ({ item, rank: null, snapshotId: tradersSnapshotId, quality: tradersResult.qualityStatus }));
  for (const { item, rank, snapshotId, quality } of [...firstBuyersItems, ...tradersItems]) {
    const position = normalizeWalletPosition(mint, item, rank, snapshotId, quality);
    if (!position) continue;
    if (rank != null) entryRanks[position.walletAddress] = rank;
    position.entryRank = undefined;
    await Wallet.findOneAndUpdate({ _id: position.walletAddress }, { $set: { _id: position.walletAddress } }, { upsert: true });
    await WalletTokenPosition.findOneAndUpdate(
      { walletAddress: position.walletAddress, tokenMint: mint },
      { $set: position },
      { upsert: true }
    );
    positionsCount++;
  }

  let holdersCount = 0;
  for (const item of asList(holdersResult.payload)) {
    const holder = normalizeHolder(mint, item, holdersSnapshotId, holdersResult.qualityStatus);
    if (!holder) continue;
    await Wallet.findOneAndUpdate({ _id: holder.walletAddress }, { $set: { _id: holder.walletAddress } }, { upsert: true });
    await TokenHolder.findOneAndUpdate(
      { tokenMint: mint, walletAddress: holder.walletAddress },
      { $set: holder },
      { upsert: true }
    );
    holdersCount++;
  }

  let roleCount = 0;
  for (const roleRow of extractRoleRows(rolesResult.payload)) {
    await Wallet.findOneAndUpdate({ _id: roleRow.wallet }, { $set: { _id: roleRow.wallet } }, { upsert: true });
    await upsertTokenRole(roleRow.wallet, mint, roleRow.role, rolesResult.provider, { providerSnapshotId: rolesSnapshotId, method: rolesResult.method });
    roleCount++;
  }

  const materialized = await materializeFeaturesAndCohorts(mint, entryRanks);
  const hasUnavailable = results.some(r => r.qualityStatus === 'unavailable');
  const hasPartial = results.some(r => r.qualityStatus === 'partial');
  const worstQuality = hasUnavailable ? 'unavailable' : hasPartial ? 'partial' : 'complete';

  return { trades: tradeCount, positions: positionsCount, holders: holdersCount, roles: roleCount, qualityStatus: worstQuality, ...materialized };
}
