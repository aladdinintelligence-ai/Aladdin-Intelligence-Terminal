import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import dl from '../providers/dataLayer.js';
import { budget } from '../providers/budgetTracker.js';
import { getTokenInfoController } from '../controllers/token/tokenInfoController.js';

const MINT = 'HKZDfZnkHZxd9agRDNPyDv4iT6LmAurJnpRtj9wpump';
// Distinct mints per test: the controller caches successes for 30s keyed by mint.
const MINT_NO_PAIR = 'AZKZfZnkHZxd9agRDNPyDv4iT6LmAurJnpRtj9wpump';
const MINT_BLOCKED = 'BZKZfZnkHZxd9agRDNPyDv4iT6LmAurJnpRtj9wpump';

const pair = {
  pairAddress: 'pair1',
  dexId: 'pumpswap',
  url: 'https://dexscreener.com/solana/pair1',
  pairCreatedAt: 1728000000000,
  baseToken: { address: MINT, name: 'Make No Mistakes', symbol: 'MISTAKE' },
  priceUsd: '0.007976',
  marketCap: 7681459,
  liquidity: { usd: 308268.62 },
  volume: { h24: 2169873, h6: 500000, h1: 90000 },
  priceChange: { h24: 12.5, h6: 3.2, h1: -0.4 },
  txns: { h24: { buys: 310, sells: 290 } },
  info: {
    imageUrl: 'https://cdn.example/img.png',
    websites: [{ url: 'https://example.com' }],
    socials: [{ type: 'twitter', url: 'https://twitter.com/x' }],
  },
};

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

async function run(mint) {
  const res = fakeRes();
  let nextErr = null;
  await getTokenInfoController({ params: { mint } }, res, (e) => { nextErr = e; });
  if (nextErr) throw nextErr;
  return res;
}

describe('token-info controller', () => {
  beforeEach(() => {
    dl.resetCacheState();
    dl.initDataLayer({
      dexResolver: async (mints) => {
        const map = {};
        for (const mint of mints) map[mint] = [pair];
        return map;
      },
    });
  });

  afterEach(() => {
    delete budget.state.day.byFeed['bitquery:__tokeninfo_test'];
  });

  test('returns token info built from the DexScreener pair', async () => {
    const res = await run(MINT);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.mint, MINT);
    assert.equal(res.body.symbol, 'MISTAKE');
    assert.equal(res.body.name, 'Make No Mistakes');
    assert.equal(res.body.priceUsd, 0.007976);
    assert.equal(res.body.marketCapUsd, 7681459);
    assert.equal(res.body.liquidityUsd, 308268.62);
    assert.equal(res.body.volume24h, 2169873);
    assert.equal(res.body.priceChange1h, -0.4);
    assert.equal(res.body.txns24h.buys, 310);
    assert.equal(res.body.imageUrl, 'https://cdn.example/img.png');
    assert.equal(res.body.website, 'https://example.com');
    assert.equal(res.body.socials.length, 1);
  });

  test('404 only when DexScreener genuinely has no pair for the mint', async () => {
    dl.initDataLayer({
      dexResolver: async (mints) => {
        const map = {};
        for (const mint of mints) map[mint] = [];
        return map;
      },
    });
    const res = await run(MINT_NO_PAIR);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'Token not found');
  });

  test('503 (not 404) when the upstream path is unavailable', async () => {
    // Trip the budget gate so dexBatch fails fast with BUDGET_EXHAUSTED.
    budget.state.day.byFeed['bitquery:__tokeninfo_test'] = budget.dailyCap();
    const res = await run(MINT_BLOCKED);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'upstream_unavailable');
  });

  test('rejects a malformed mint with 400', async () => {
    const res = await run('too-short');
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Invalid mint address');
  });
});
