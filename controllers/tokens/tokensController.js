import { randomUUID } from 'crypto';
import { Token, TokenHolder, TokenLifecycle, TokenFeature, Trade, WalletTokenPosition, WalletTokenFeature, WalletBehaviourIdentity, WalletRecentBehaviourState, WalletTokenRole, WalletTokenEpisode } from '../../models/index.js';
import { syncToken } from '../../services/syncToken.js';
import { resolveDisplayIdentity, getRecentBehaviour } from '../../services/identityResolver.js';
import { materializeDisplayCohorts } from '../../services/cohortService.js';

const QUALITY_ORDER = { unavailable: 0, stale: 1, partial: 2, reconciling: 3, complete: 4 };

function requestId() { return randomUUID(); }

async function metaForToken(mint, fallbackSource = 'canonical_mongodb', quality = 'partial') {
  const snapshot = await import('../../models/index.js').then(m => m.ProviderRawSnapshot)
    .then(M => M.findOne({ targetId: mint }).sort({ capturedAt: -1 }).limit(1).lean());
  if (snapshot) {
    return { asOf: snapshot.fetchedAt || snapshot.capturedAt, source: snapshot.provider, coverage: snapshot.coverage != null ? Number(snapshot.coverage) : null, qualityStatus: snapshot.qualityStatus, requestId: requestId() };
  }
  return { asOf: new Date(), source: fallbackSource, coverage: null, qualityStatus: quality, requestId: requestId() };
}

function pageMeta(limit, cursor, returned, nextOffset) {
  return { limit, cursor, nextCursor: returned === limit ? String(nextOffset) : null, count: returned };
}

function parseCursor(cursor) {
  if (cursor == null) return 0;
  const n = parseInt(cursor, 10);
  if (isNaN(n) || n < 0) throw Object.assign(new Error('cursor must be an integer offset token'), { status: 400 });
  return n;
}

async function requireToken(mint) {
  const token = await Token.findById(mint).lean();
  if (!token) throw Object.assign(new Error('token_not_found'), { status: 404, detail: { error: 'token_not_found', mint } });
  return token;
}

export async function syncTokenController(req, res, next) {
  try {
    const { mint } = req.params;
    const tradeLimit = Math.min(Math.max(parseInt(req.query.trade_limit) || 100, 1), 1000);
    const holderLimit = Math.min(Math.max(parseInt(req.query.holder_limit) || 100, 1), 1000);
    const stats = await syncToken(mint, tradeLimit, holderLimit);
    const meta = await metaForToken(mint, 'canonical_mongodb', stats.qualityStatus || 'partial');
    return res.status(200).json({ status: 'ok', token_mint: mint, stats, meta });
  } catch (exc) {
    if (exc.status) return res.status(exc.status).json({ error: exc.message, ...exc.detail });
    return next(exc);
  }
}

export async function getTokenController(req, res, next) {
  try {
    const { mint } = req.params;
    const token = await requireToken(mint);
    const lifecycle = await TokenLifecycle.findById(mint).lean();
    const features = await TokenFeature.findById(mint).lean();
    const data = {
      mint: token._id, symbol: token.symbol, name: token.name, imageUrl: token.imageUrl,
      metadataUri: token.metadataUri, creator: token.creator, launchTimestamp: token.launchTimestamp,
      lifecycleStatus: lifecycle?.stage || token.migrationState, migrationProgress: token.migrationProgress,
      priceUsd: token.priceUsd, marketCapUsd: token.marketCapUsd, liquidityUsd: token.liquidityUsd,
      volumeUsd: token.volumeUsd, holders: token.holders || features?.holderCount, buys: token.buys, sells: token.sells,
      sourceSnapshotId: token.providerSnapshotId,
    };
    const meta = await metaForToken(mint, 'canonical_mongodb', token.qualityStatus);
    return res.json({ data, meta });
  } catch (exc) {
    if (exc.status) return res.status(exc.status).json({ error: exc.message, ...exc.detail });
    return next(exc);
  }
}

export async function getTradesController(req, res, next) {
  try {
    const { mint } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 1000);
    const order = ['asc', 'desc'].includes(req.query.order) ? req.query.order : 'desc';
    const side = ['buy', 'sell'].includes(req.query.side) ? req.query.side : null;
    const offset = parseCursor(req.query.cursor);
    await requireToken(mint);
    const sort = order === 'asc' ? { blockTime: 1, _id: 1 } : { blockTime: -1, _id: -1 };
    const query = { tokenMint: mint };
    if (side) query.side = side;
    const rows = await Trade.find(query).sort(sort).skip(offset).limit(limit).lean();
    const items = [];
    for (const row of rows) {
      const position = await WalletTokenPosition.findOne({ tokenMint: mint, walletAddress: row.walletAddress }).select('remainingPct').lean();
      const displayIdentity = await resolveDisplayIdentity(row.walletAddress, mint);
      items.push({
        tradeId: row._id, transactionSignature: row.transactionSignature, timestamp: row.blockTime,
        wallet: row.walletAddress, side: row.side, solAmount: row.solAmount, usdAmount: row.usdAmount,
        tokenAmount: row.tokenAmount, priceUsd: row.priceUsd, marketCapUsd: row.marketCapUsd,
        currentHoldingPct: position?.remainingPct || null, displayIdentity, qualityStatus: row.qualityStatus,
      });
    }
    const meta = await metaForToken(mint);
    return res.json({ data: items, meta, page: pageMeta(limit, req.query.cursor, items.length, offset + items.length) });
  } catch (exc) {
    if (exc.status) return res.status(exc.status).json({ error: exc.message, ...exc.detail });
    return next(exc);
  }
}

export async function getParticipantsController(req, res, next) {
  try {
    const { mint } = req.params;
    await requireToken(mint);
    const items = await materializeDisplayCohorts(mint);
    const meta = await metaForToken(mint);
    return res.json({ data: items, meta });
  } catch (exc) {
    if (exc.status) return res.status(exc.status).json({ error: exc.message, ...exc.detail });
    return next(exc);
  }
}

export async function getFirstBuyersController(req, res, next) {
  try {
    const { mint } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const offset = parseCursor(req.query.cursor);
    await requireToken(mint);
    const rows = await WalletTokenFeature.find({ tokenMint: mint, entryRank: { $ne: null } })
      .sort({ entryRank: 1, walletAddress: 1 }).skip(offset).limit(limit).lean();
    const items = [];
    for (const row of rows) {
      const firstEntry = await Trade.findOne({ tokenMint: mint, walletAddress: row.walletAddress, side: 'buy' })
        .sort({ blockTime: 1 }).select('blockTime').lean();
      const displayIdentity = await resolveDisplayIdentity(row.walletAddress, mint);
      items.push({
        entryRank: row.entryRank, wallet: row.walletAddress, displayIdentity,
        firstEntryTime: firstEntry?.blockTime, firstEntryAmountSol: row.amountBoughtSol,
        acquiredSupply: null, remainingPct: row.remainingPct, soldAmountSol: row.amountSoldSol,
        realisedPnlUsd: row.realisedPnlUsd, roiPct: row.roiPct, qualityStatus: row.qualityStatus,
      });
    }
    const meta = await metaForToken(mint);
    return res.json({ data: items, meta, page: pageMeta(limit, req.query.cursor, items.length, offset + items.length) });
  } catch (exc) {
    if (exc.status) return res.status(exc.status).json({ error: exc.message, ...exc.detail });
    return next(exc);
  }
}

export async function getHoldersController(req, res, next) {
  try {
    const { mint } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const offset = parseCursor(req.query.cursor);
    await requireToken(mint);
    const rows = await TokenHolder.find({ tokenMint: mint }).sort({ supply: -1, walletAddress: 1 }).skip(offset).limit(limit).lean();
    const items = [];
    for (const row of rows) {
      const displayIdentity = await resolveDisplayIdentity(row.walletAddress, mint);
      items.push({
        wallet: row.walletAddress, displayIdentity, tokenBalance: row.supply, supplyPct: row.supplyPct,
        usdValue: row.usdValue, firstObservedAt: row.firstObservedAt, lastObservedAt: row.lastObservedAt,
        soldRemainingPct: row.soldRemainingPct, qualityStatus: row.qualityStatus,
      });
    }
    const meta = await metaForToken(mint);
    return res.json({ data: items, meta, page: pageMeta(limit, req.query.cursor, items.length, offset + items.length) });
  } catch (exc) {
    if (exc.status) return res.status(exc.status).json({ error: exc.message, ...exc.detail });
    return next(exc);
  }
}

export async function getProfitableWalletsController(req, res, next) {
  try {
    const { mint } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const offset = parseCursor(req.query.cursor);
    await requireToken(mint);
    const rows = await WalletTokenPosition.find({ tokenMint: mint }).sort({ realisedPnlUsd: -1, walletAddress: 1 }).skip(offset).limit(limit).lean();
    const items = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const displayIdentity = await resolveDisplayIdentity(row.walletAddress, mint);
      items.push({
        rank: offset + i + 1, wallet: row.walletAddress, displayIdentity,
        realisedPnlUsd: row.realisedPnlUsd, unrealisedPnlUsd: row.unrealisedPnlUsd, roiPct: row.roiPct,
        entryValueSol: row.boughtSol, boughtAmountSol: row.boughtSol, soldAmountSol: row.soldSol,
        remainingPct: row.remainingPct, firstTradeTime: row.firstTradeAt, lastTradeTime: row.lastTradeAt,
        costBasisStatus: row.costBasisStatus, qualityStatus: row.qualityStatus,
      });
    }
    const meta = await metaForToken(mint);
    return res.json({ data: items, meta, page: pageMeta(limit, req.query.cursor, items.length, offset + items.length) });
  } catch (exc) {
    if (exc.status) return res.status(exc.status).json({ error: exc.message, ...exc.detail });
    return next(exc);
  }
}

export async function getWalletTokenController(req, res, next) {
  try {
    const { wallet, mint } = req.params;
    await requireToken(mint);
    const position = await WalletTokenPosition.findOne({ walletAddress: wallet, tokenMint: mint }).lean();
    if (!position) return res.status(404).json({ error: 'wallet_not_found_for_token', wallet, mint });
    const features = await WalletTokenFeature.findOne({ walletAddress: wallet, tokenMint: mint }).lean();
    const persistent = await WalletBehaviourIdentity.findById(wallet).lean();
    const recent = await WalletRecentBehaviourState.findOne({ walletAddress: wallet }).sort({ windowEnd: -1 }).limit(1).lean();
    const roles = await WalletTokenRole.find({ walletAddress: wallet, tokenMint: mint }).lean();
    const episodes = await WalletTokenEpisode.find({ walletAddress: wallet, tokenMint: mint }).sort({ episodeIndex: 1 }).lean();
    const displayIdentity = await resolveDisplayIdentity(wallet, mint);
    const data = {
      wallet, token: mint,
      persistentAladdinBehaviour: persistent ? { primary_behaviour_key: persistent.primaryBehaviourKey } : { primary_behaviour_key: 'unknown' },
      recentBehaviour: recent, tokenSpecificRoles: roles, displayIdentity,
      firstEntry: position.firstTradeAt, entryRank: features?.entryRank || null,
      buys: position.buyCount, sells: position.sellCount,
      boughtAmountSol: position.boughtSol, soldAmountSol: position.soldSol, remainingPct: position.remainingPct,
      episodes: episodes.map(e => ({
        episodeIndex: e.episodeIndex, status: e.episodeStatus, openedAt: e.openedAt, closedAt: e.closedAt,
        boughtTokenAmount: e.boughtTokenAmount, soldTokenAmount: e.soldTokenAmount, remainingTokenAmount: e.remainingTokenAmount,
        holdingDurationSeconds: e.holdingDurationSeconds, holdingDurationSoFar: e.holdingDurationSoFar,
        durationCensored: e.durationCensored, heldThroughMigration: e.heldThroughMigration, qualityStatus: e.coverageStatus,
      })),
      pnlUsd: position.realisedPnlUsd, roiPct: position.roiPct, evidenceCoverage: null, qualityStatus: position.qualityStatus,
    };
    const meta = await metaForToken(mint);
    return res.json({ data, meta });
  } catch (exc) {
    if (exc.status) return res.status(exc.status).json({ error: exc.message, ...exc.detail });
    return next(exc);
  }
}
