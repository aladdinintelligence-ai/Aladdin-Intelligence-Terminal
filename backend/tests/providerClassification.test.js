import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

import config from '../configs/dataLayer.js';
import { budget } from '../providers/budgetTracker.js';
import dl from '../providers/dataLayer.js';

const { initDataLayer, bitquery, resetCacheState, setTokenBucketEnabled, internals } = dl;
const { bitqueryBreaker, breakerIsOpen } = internals;

const datasetQuery = (mint) => `{ Solana(dataset: combined) { DEXTradeByTokens(where: { Trade: { Currency: { MintAddress: { is: "${mint}" } } } }) { count } } }`;

// A real 403 "access restricted: the 'combined' dataset ... only allows
// 'realtime'" is thrown by axios (it rejects on 4xx/5xx), which previously
// made opossum count the failure and could open the circuit.
function forbiddenError(status = 403) {
  const err = new Error(`Request failed with status code ${status}: access restricted: dataset not allowed by plan`);
  err.response = { status, data: { error: 'forbidden' } };
  return err;
}

before(() => {
  setTokenBucketEnabled(false);
});

beforeEach(() => {
  resetCacheState();
  setTokenBucketEnabled(false); // resetCacheState() re-enables it; keep it off for deterministic pacing
  budget.reset();
});

after(() => {
  budget.reset();
});

describe('plan-forbidden (403) classification', () => {
  test('403 is non-retryable: exactly one wire attempt, returned with status 403', async () => {
    let calls = 0;
    initDataLayer({
      bitqueryResolver: async () => { calls += 1; throw forbiddenError(403); },
    });
    const res = await bitquery(datasetQuery('chartMint1'), ':ohlc', { feed: 'chart', priority: 'user' });
    assert.equal(res.status, 403);
    assert.match(res.error, /403/);
    assert.equal(calls, 1, '403 must not be retried');
  });

  test('repeated identical 403s are negative-cached: ~1 wire attempt total, breaker never opens', async () => {
    let calls = 0;
    initDataLayer({
      bitqueryResolver: async () => { calls += 1; throw forbiddenError(403); },
    });
    const query = datasetQuery('chartMint2');
    const results = [];
    for (let i = 0; i < 15; i++) {
      results.push(await bitquery(query, ':ohlc', { feed: 'chart', priority: 'user' }));
    }
    assert.equal(calls, 1, 'first 403 spent 1 call; the rest came from the negative cache');
    assert.equal(results.every((r) => r.status === 403), true);
    assert.equal(breakerIsOpen(bitqueryBreaker), false, 'chart 403s must never open the circuit');
  });

  test('distinct 403 queries (bypassing the negative cache) still never open the breaker', async () => {
    let calls = 0;
    initDataLayer({
      bitqueryResolver: async () => { calls += 1; throw forbiddenError(403); },
    });
    const results = [];
    for (let i = 0; i < 25; i++) {
      results.push(await bitquery(datasetQuery(`forbidden${i}`), ':ohlc', { feed: 'chart', priority: 'user' }));
    }
    assert.equal(calls, 25, 'each distinct forbidden query reached the wire once');
    assert.equal(results.every((r) => r.status === 403), true);
    assert.equal(breakerIsOpen(bitqueryBreaker), false, 'forbidden 4xx must not count toward the breaker');
  });

  test('disabled feed returns FEED_DISABLED and never reaches the wire', async () => {
    config.disabledFeeds.push('chart');
    try {
      let calls = 0;
      initDataLayer({ bitqueryResolver: async () => { calls += 1; return { data: {} }; } });
      const res = await bitquery(datasetQuery('whatever'), ':ohlc', { feed: 'chart', priority: 'user' });
      assert.equal(res.status, 503);
      assert.equal(res.error, 'FEED_DISABLED');
      assert.equal(calls, 0, 'disabled feed must spend zero calls');
    } finally {
      config.disabledFeeds.pop();
    }
  });
});