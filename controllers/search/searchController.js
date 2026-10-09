import axios from 'axios';

const SEARCH_TTL = 30_000;
const EMPTY_TTL = 5_000;
const MIN_UPSTREAM_GAP = 300;
const RESULT_LIMIT = 8;

const cache = new Map();
const inFlight = new Map();
let lastUpstreamAt = 0;

const SEARCH_URL = (q) => `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;

export const internals = { validMint, normalizePair, dedupeByMint, RESULT_LIMIT };

const NUMBER = (v) => (v != null ? Number(v) : null);

function validMint(address) {
  return typeof address === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function normalizePair(pair) {
  const base = pair?.baseToken;
  if (!base || !validMint(base.address)) return null;
  if (pair.chainId !== 'solana') return null;
  if (!base.symbol || !base.name) return null;

  return {
    mint: base.address,
    symbol: base.symbol,
    name: base.name,
    imageUrl: pair.info?.imageUrl || null,
    priceUsd: NUMBER(pair.priceUsd),
    priceChange24h: NUMBER(pair.priceChange?.h24),
    volume24h: NUMBER(pair.volume?.h24),
    liquidityUsd: NUMBER(pair.liquidity?.usd),
    marketCapUsd: NUMBER(pair.marketCap) ?? NUMBER(pair.fdv),
    fdvUsd: NUMBER(pair.fdv),
    pairAddress: pair.pairAddress || null,
    dexId: pair.dexId || null,
    pairCreatedAt: pair.pairCreatedAt != null ? Number(pair.pairCreatedAt) : null,
    url: pair.url || null,
  };
}

// Each mint can match many pairs (one per DEX). Keep the strongest pair per
// mint and preserve the relevance order DexScreener returned.
function dedupeByMint(pairs) {
  const bestByMint = new Map();
  for (const p of pairs) {
    if (!p) continue;
    const score = p.liquidityUsd ?? p.fdvUsd ?? p.marketCapUsd ?? 0;
    const prev = bestByMint.get(p.mint);
    if (!prev || score > (prev.liquidityUsd ?? prev.fdvUsd ?? prev.marketCapUsd ?? 0)) {
      if (prev) bestByMint.delete(p.mint);
      bestByMint.set(p.mint, p);
    }
  }
  return bestByMint;
}

async function fetchSearch(q) {
  const res = await axios.get(SEARCH_URL(q), { timeout: 8000 });
  const pairs = (res.data && res.data.pairs) || [];
  const dedup = dedupeByMint(pairs.map(normalizePair));
  return [...dedup.values()].slice(0, RESULT_LIMIT);
}

export async function getSearchController(req, res, next) {
  const q = String(req.query.q || '').trim().slice(0, 100).toLowerCase();
  try {
    if (!q) return res.json([]);

    const cached = cache.get(q);
    if (cached && Date.now() - cached.ts < (cached.empty ? EMPTY_TTL : SEARCH_TTL)) {
      return res.json(cached.data);
    }

    const key = `q:${q}`;
    if (inFlight.has(key)) {
      try {
        return res.json(await inFlight.get(key));
      } catch (err) {
        // a concurrent request failed: fall through to retry our own fetch
      }
    }

    const gate = Math.max(0, MIN_UPSTREAM_GAP - (Date.now() - lastUpstreamAt));
    if (gate > 0) await new Promise((r) => setTimeout(r, gate));

    const promise = (async () => {
      const data = await fetchSearch(q);
      lastUpstreamAt = Date.now();
      return data;
    })();

    inFlight.set(key, promise);
    try {
      const data = await promise;
      cache.set(q, { data, ts: Date.now(), empty: data.length === 0 });
      return res.json(data);
    } finally {
      inFlight.delete(key);
    }
  } catch (exc) {
    // Upstream unavailable/search backend unreachable: transient by nature —
    // a 503 so clients can retry instead of a wrong "no results" empty list.
    if (cache.has(q)) return res.json(cache.get(q).data);
    return res.status(503).json({
      error: 'upstream_unavailable',
      message: 'Token search is temporarily unavailable. Please try again in a few seconds.',
    });
  }
}