import {
  fetchNewTokens,
  fetchAlmostBondedTokens,
  fetchMigratedTokens,
  fetchTrendingTokens,
  fetchMovers,
  provider as dataProvider,
} from '../providers/index.js';
import dl from '../providers/dataLayer.js';
import { Token, TokenHolder, WalletTokenPosition, WalletBehaviourIdentity } from '../models/index.js';

const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const CACHE_TTL = 60_000;
const cache = new Map();

function cached(key, fallback) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.value;
  const pending = fallback();
  if (pending && typeof pending.then === 'function') {
    pending.then((value) => cache.set(key, { value, ts: Date.now() })).catch(() => {});
  }
  return pending;
}

function nullOr(value) {
  return value == null || Number.isNaN(value) ? null : value;
}

function formatUsd(value) {
  return value == null ? null : Math.round(value);
}

function compactWallet(wallet) {
  if (!wallet) return '';
  return wallet.length > 11 ? `${wallet.slice(0, 7)}...${wallet.slice(-4)}` : wallet;
}

function classifyFormation(token) {
  const mc = token.marketCapUsd || 0;
  const liq = token.liquidityUsd || 0;
  const vol = token.volume24h != null ? token.volume24h : (token.volume || 0);
  const buyers = token.buyers || 0;
  if (mc < 5000) return 'DISCOVERY';
  if (mc < 20000 && buyers < 50) return 'EARLY ACCUMULATION';
  if (mc < 50000 && buyers < 150) return 'PARTICIPATION EXPANSION';
  if (mc < 100000 && vol > mc * 0.3) return 'BROAD ACCUMULATION';
  if (mc < 200000 && liq > mc * 0.15) return 'MIGRATION POSITIONING';
  if (mc >= 200000 && buyers > 200) return 'POST-MIGRATION EXPANSION';
  return 'CONCENTRATED ACCUMULATION';
}

function scoreStrength(token) {
  const score = (token.realisedPnlUsd ?? token.profitableWallets ?? 0);
  if (score && score > 0) return 'Profitable participation';
  return 'Formation in progress';
}

function scoreRisk(token) {
  const conc = token.top10Supply != null ? token.top10Supply : 0;
  if (conc >= 40) return 'High top-holder concentration';
  if ((token.buyers || 0) < 30) return 'Thin buyer participation';
  return 'Moderate concentration';
}

function tokenFeedRows(rawTokens) {
  return rawTokens
    .filter((t) => t && t.mint)
    .slice(0, 10)
    .map((t) => {
      const mc = nullOr(formatUsd(t.marketCapUsd != null ? t.marketCapUsd : (t.marketCap ?? null)));
      const liq = nullOr(formatUsd(t.liquidityUsd != null ? t.liquidityUsd : (t.liquidity ?? null)));
      const vol = nullOr(formatUsd(t.volume24h != null ? t.volume24h : (t.volume ?? null)));
      const holders = nullOr(t.holders ?? t.holderCount ?? null);
      const buyers = nullOr(t.buyers ?? t.buyCount ?? null);
      const retention = nullOr(t.retention != null ? t.retention : (t.first100Retention ?? null));
      const profitable = nullOr(t.profitableWallets ?? null);
      const formation = (t.formation || classifyFormation({ ...t, volume24h: vol }));
      return {
        id: `token-${t.mint}`,
        entityType: 'token',
        tokenId: t.mint,
        terminalView: 'Live State',
        values: {
          token: `${t.symbol || t.name || 'Unknown'} · $${(t.symbol || t.mint.slice(0, 4)).toUpperCase()}`,
          contractAddress: t.mint,
          marketCap: mc,
          liquidity: liq,
          volume: vol,
          holders,
          retention,
          profitableWallets: profitable,
          strength: scoreStrength(t),
          risk: scoreRisk(t),
        },
      };
    });
}

function walletRows(rows) {
  return rows
    .filter((r) => r && r.walletAddress)
    .slice(0, 10)
    .map((r) => ({
      id: `wallet-${r.walletAddress}`,
      entityType: 'wallet',
      walletId: r.walletAddress,
      terminalView: 'Participants',
      values: {
        wallet: compactWallet(r.walletAddress),
        behaviour: r.behaviour || 'Unknown',
        amount: r.boughtSol != null ? Math.round(Number(r.boughtSol) * 100) / 100 : null,
        side: r.side || 'Buy',
        supply: r.supplyPct != null ? Math.round(Number(r.supplyPct) * 100) / 100 : null,
        amountSold: r.amountSold != null ? Math.round(Number(r.amountSold)) : null,
        stillHolding: r.stillHolding != null ? Math.round(Number(r.stillHolding)) : null,
      },
    }));
}

const columnSets = {
  tokens: [
    { key: 'token', label: 'Token', kind: 'tokenLink' },
    { key: 'contractAddress', label: 'Contract', kind: 'contract' },
    { key: 'marketCap', label: 'Market cap', kind: 'usd' },
    { key: 'liquidity', label: 'Liquidity', kind: 'usd' },
    { key: 'volume', label: 'Volume', kind: 'usd' },
    { key: 'holders', label: 'Holders', kind: 'number' },
    { key: 'retention', label: 'First-100', kind: 'percent' },
    { key: 'profitableWallets', label: 'Profitable wallets', kind: 'number' },
    { key: 'strength', label: 'Main strength', kind: 'text' },
    { key: 'risk', label: 'Main risk', kind: 'text' },
  ],
  wallets: [
    { key: 'wallet', label: 'Wallet', kind: 'wallet' },
    { key: 'behaviour', label: 'Behaviour', kind: 'text' },
    { key: 'amount', label: 'Amount', kind: 'money' },
    { key: 'side', label: 'Side', kind: 'side' },
    { key: 'supply', label: 'Supply acquired', kind: 'percent' },
    { key: 'amountSold', label: 'Amount sold', kind: 'token' },
    { key: 'stillHolding', label: 'Still holding', kind: 'token' },
  ],
};

const tokenColumns = columnSets.tokens;
const walletColumns = columnSets.wallets;

async function fetchFeed(tab, limit = 10) {
  const fetchers = {
    new: fetchNewTokens,
    'almost-bonded': fetchAlmostBondedTokens,
    migrated: fetchMigratedTokens,
    trending: fetchTrendingTokens,
  };
  const fetcher = fetchers[tab] || fetchNewTokens;
  const result = await fetcher(limit);
  if (result.error) throw new Error(result.error);
  return result.tokens || [];
}

async function fetchMoverFeed(limit = 10) {
  const result = await fetchMovers(limit);
  if (result.error) throw new Error(result.error);
  return (result.tokens || []).map((t) => ({
    ...t,
    marketCapUsd: t.mc ?? t.marketCapUsd,
  }));
}

async function bestEffortTokens(mint) {
  const results = await Promise.allSettled([fetchMoverFeed(20), fetchFeed('new', 20), fetchFeed('trending', 20)]);
  const merged = new Map();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const t of result.value || []) {
      if (t.mint) merged.set(t.mint, t);
    }
  }
  if (mint) {
    const match = [...merged.values()].find((t) => t.mint === mint) || null;
    if (match) return match;
  }
  return null;
}

export async function resolveMintFromQuestion(question) {
  const words = (question || '').split(/\s+/);
  const direct = words.map((w) => w.replace(/[^\w]/g, '')).filter((w) => MINT_RE.test(w));
  if (direct.length) return direct[0];
  return null;
}

// A base58 address matches MINT_RE whether it is an SPL mint or a wallet, so
// the regex alone cannot tell them apart. An address is treated as a token
// when it has a DEX pool on the provider or a record in the token collection.
// This sits on the ask critical path, so the answer is cached and any lookup
// failure falls back to "not a token" rather than failing the request.
export async function isTokenMint(address) {
  if (!MINT_RE.test(address)) return false;
  return cached(`ismint:${address}`, async () => {
    try {
      if (await Token.exists({ _id: address })) return true;

      const query = `{
        Solana {
          DEXPools(
            limit: { count: 1 }
            where: { Pool: { Market: { BaseCurrency: { MintAddress: { is: "${address}" } } } } }
          ) {
            Pool { Market { BaseCurrency { MintAddress } } }
          }
        }
      }`;
      const { data } = await dl.bitquery(query, 'isTokenMint', { feed: 'ismint', priority: 'user' });
      return Boolean(data?.Solana?.DEXPools?.length);
    } catch (err) {
      console.error(`[isTokenMint] lookup failed for ${address.slice(0, 8)}: ${err.message}`);
      return false;
    }
  });
}

export async function lookUpToken(mint) {
  return Token.findById(mint).lean();
}

export async function resolveTokenBySymbol(symbol) {
  const r = (symbol || '').toUpperCase().replace(/^\$/, '');
  if (!r) return null;
  const token = await Token.findOne({ symbol: r }).lean();
  if (token) return token;
  const feed = await bestEffortTokens();
  const hit = (feed ? [feed] : []).concat([]).find((t) => (t.symbol || '').toUpperCase() === r);
  if (hit) return { _id: hit.mint, symbol: hit.symbol, name: hit.name, marketCapUsd: hit.marketCapUsd ? Number(hit.marketCapUsd) : null };
  return null;
}

export async function runTool(toolName, params = {}) {
  switch (toolName) {
    case 'get_movers':
      return getMovers(params.limit || 10);
    case 'get_launches':
      return getLaunches(params.tab || 'new', params.limit || 10);
    case 'get_token_detail':
      return getTokenDetail(params.mint);
    case 'get_token_holders':
      return getTokenHolders(params.mint, params.limit || 10);
    case 'get_profitable_wallets':
      return getProfitableWallets(params.mint, params.limit || 10);
    case 'get_migration_specialists':
      return getMigrationSpecialists(params.mint, params.limit || 10);
    case 'get_wallet_position':
      return getWalletPosition(params.wallet, params.mint);
    default:
      return { ok: false, error: `Unknown tool "${toolName}"` };
  }
}

export async function getMovers(limit = 10) {
  try {
    const raw = await cached(`movers:${limit}`, () => fetchMoverFeed(limit));
    if (!raw.length) return { ok: false, error: 'No mover records available' };
    const mapped = raw.map((t) => ({
      ...t,
      marketCapUsd: t.marketCapUsd != null ? Number(t.marketCapUsd) : null,
      liquidityUsd: t.liquidity != null ? Number(t.liquidity) : null,
      volume24h: t.volume != null ? Number(t.volume) : null,
      buyers: t.buyers ?? null,
      formation: t.formation || classifyFormation(t),
    }));
    const rows = tokenFeedRows(mapped);
    return { ok: true, columns: tokenColumns, rows, totalRows: rows.length, meta: { source: `${dataProvider}+dexscreener`, tool: 'get_movers' } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function getLaunches(tab = 'new', limit = 10) {
  try {
    const raw = await cached(`launches:${tab}:${limit}`, () => fetchFeed(tab, limit));
    if (!raw.length) return { ok: false, error: `No ${tab} launch records available` };
    const rows = tokenFeedRows(raw);
    return { ok: true, columns: tokenColumns, rows, totalRows: rows.length, meta: { source: dataProvider, tab, tool: 'get_launches' } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function getTokenDetail(mint) {
  try {
    const fromFeed = await bestEffortTokens(mint);
    const fromDb = await lookUpToken(mint);
    const t = fromFeed || fromDb || null;
    if (!t) return { ok: false, error: 'token not found' };

    const marketCap = nullOr(formatUsd(t.marketCapUsd != null ? t.marketCapUsd : (fromDb?.marketCapUsd ?? null)));
    const liquidity = nullOr(formatUsd(t.liquidityUsd != null ? t.liquidityUsd : (fromDb?.liquidityUsd ?? null)));
    const volume = nullOr(formatUsd(t.volume24h != null ? t.volume24h : (fromDb?.volumeUsd ?? t.volume ?? null)));
    const holders = nullOr(t.holders ?? fromDb?.holders ?? null);

    const row = {
      id: `token-${mint}`,
      entityType: 'token',
      tokenId: mint,
      terminalView: 'Live State',
      values: {
        token: `${t.symbol || t.name || 'Unknown'} · $${(t.symbol || mint.slice(0, 4)).toUpperCase()}`,
        contractAddress: mint,
        marketCap: marketCap,
        liquidity: liquidity,
        volume: volume,
        holders,
        retention: nullOr(t.retention ?? null),
        profitableWallets: nullOr(t.profitableWallets ?? null),
        strength: scoreStrength(t),
        risk: scoreRisk(t),
      },
    };
    return {
      ok: true,
      columns: tokenColumns,
      rows: [row],
      totalRows: 1,
      meta: { source: fromFeed ? `${dataProvider}+dexscreener` : 'canonical_mongodb', tool: 'get_token_detail' },
      entity: { mint, symbol: t.symbol || null, name: t.name || null },
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function getTokenHolders(mint, limit = 10) {
  try {
    const rows = await TokenHolder.find({ tokenMint: mint }).sort({ supply: -1 }).limit(limit).lean();
    if (!rows.length) return { ok: false, error: 'no holder records available' };
    return { ok: true, columns: tokenColumns, rows: [], totalRows: rows.length, holderCount: rows.length, meta: { source: 'canonical_mongodb', tool: 'get_token_holders' } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function getProfitableWallets(mint, limit = 10) {
  try {
    const rows = await WalletTokenPosition.find({ tokenMint: mint, realisedPnlUsd: { $gt: 0 } })
      .sort({ realisedPnlUsd: -1 }).limit(limit).lean();
    if (!rows.length) return { ok: false, error: 'no profitable wallet records available' };
    const finalRows = walletRows(rows.filter((r) => !r.entryRank));
    const withBehaviour = [];
    for (const r of rows.slice(0, limit)) {
      const identity = await WalletBehaviourIdentity.findById(r.walletAddress).lean();
      const boughtSol = Number(r.boughtSol) || 0;
      const soldSol = Number(r.soldSol) || 0;
      const remaining = Number(r.remainingPct) != null && Number(r.remainingPct) >= 0 ? Number(r.remainingPct) : null;
      const stillHolding = remaining != null && boughtSol ? Math.round(remaining * boughtSol) : null;
      withBehaviour.push({
        id: `wallet-${r.walletAddress}`,
        entityType: 'wallet',
        walletId: r.walletAddress,
        terminalView: 'Participants',
        values: {
          wallet: compactWallet(r.walletAddress),
          behaviour: identity?.primaryBehaviourKey
            ? ({ migration_specialist: 'Migration Specialist', scalper: 'Scalper' }[identity.primaryBehaviourKey] || identity.primaryBehaviourKey)
            : 'Unclassified',
          amount: Math.round(boughtSol * 100) / 100,
          side: 'Buy',
          supply: null,
          amountSold: Math.round(soldSol * 100) / 100,
          stillHolding,
        },
      });
    }
    return { ok: true, columns: walletColumns, rows: withBehaviour, totalRows: withBehaviour.length, meta: { source: 'canonical_mongodb', tool: 'get_profitable_wallets' } };
  } catch (err) {
    return { ok: false, error: err.message, rows: null };
  }
}

export async function getMigrationSpecialists(mint, limit = 10) {
  try {
    const identities = await WalletBehaviourIdentity.find({ primaryBehaviourKey: 'migration_specialist' })
      .sort({ tokensObserved: -1 }).limit(limit * 2).lean();
    if (!identities.length) return { ok: false, error: 'no migration specialist records available' };
    const wallets = [];
    for (const ident of identities.slice(0, limit)) {
      const position = mint
        ? await WalletTokenPosition.findOne({ walletAddress: ident._id, tokenMint: mint }).lean()
        : null;
      const boughtSol = position ? Number(position.boughtSol) || 0 : null;
      const soldSol = position ? Number(position.soldSol) || 0 : null;
      const remaining = position && Number(position.remainingPct) != null ? Number(position.remainingPct) : null;
      const stillHolding = remaining != null && boughtSol ? Math.round(remaining * boughtSol) : null;
      wallets.push({
        id: `wallet-${ident._id}`,
        entityType: 'wallet',
        walletId: ident._id,
        terminalView: 'Participants',
        values: {
          wallet: compactWallet(ident._id),
          behaviour: 'Migration Specialist',
          amount: boughtSol != null ? Math.round(boughtSol * 100) / 100 : null,
          side: 'Buy',
          supply: null,
          amountSold: soldSol != null ? Math.round(soldSol * 100) / 100 : null,
          stillHolding,
        },
      });
    }
    return { ok: true, columns: walletColumns, rows: wallets, totalRows: wallets.length, meta: { source: 'canonical_mongodb', tool: 'get_migration_specialists' } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function getWalletPosition(wallet, mint) {
  try {
    const position = await WalletTokenPosition.findOne({ walletAddress: wallet, tokenMint: mint }).lean();
    const identity = await WalletBehaviourIdentity.findById(wallet).lean();
    if (!position) return { ok: false, error: 'position not found' };
    const boughtSol = Number(position.boughtSol) || 0;
    const soldSol = Number(position.soldSol) || 0;
    const remaining = Number(position.remainingPct) != null ? Number(position.remainingPct) : null;
    return {
      ok: true,
      columns: walletColumns,
      rows: [{
        id: `wallet-${wallet}`,
        entityType: 'wallet',
        walletId: wallet,
        terminalView: 'Participants',
        values: {
          wallet: compactWallet(wallet),
          behaviour: identity?.primaryBehaviourKey
            ? ({ migration_specialist: 'Migration Specialist', scalper: 'Scalper' }[identity.primaryBehaviourKey] || identity.primaryBehaviourKey)
            : 'Unclassified',
          amount: Math.round(boughtSol * 100) / 100,
          side: 'Buy',
          supply: null,
          amountSold: Math.round(soldSol * 100) / 100,
          stillHolding: remaining != null && boughtSol ? Math.round(remaining * boughtSol) : null,
        },
      }],
      totalRows: 1,
      meta: { source: 'canonical_mongodb', tool: 'get_wallet_position' },
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export { tokenColumns, walletColumns, compactWallet };