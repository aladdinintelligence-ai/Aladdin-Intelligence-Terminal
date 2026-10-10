// Proves the circuit breaker is still alive for genuinely retryable upstream
// failures, i.e. the 403-handling change did not disable breaker protection.
// Runs in its own node --test subprocess (each test file is a child process),
// so this file's opossum window holds only failures -> percentage stays 100%
// and the circuit opens deterministically at volumeThreshold(10).

import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

import { budget } from '../providers/budgetTracker.js';
import dl from '../providers/dataLayer.js';

const { initDataLayer, bitquery, resetCacheState, setTokenBucketEnabled, internals } = dl;
const { bitqueryBreaker, breakerIsOpen } = internals;

const datasetQuery = (mint) => `{ Solana { DEXTradeByTokens(where: { Trade: { Currency: { MintAddress: { is: "${mint}" } } } }) { count } } }`;

before(() => {
  setTokenBucketEnabled(false);
});

beforeEach(() => {
  resetCacheState();
  setTokenBucketEnabled(false);
  budget.reset();
});

after(() => {
  budget.reset();
});

describe('breaker still trips on retryable failures', () => {
  test('5xx upstream failures count toward the breaker and open it within volume', async () => {
    let calls = 0;
    initDataLayer({
      bitqueryResolver: async () => { calls += 1; throw new Error('socket hang up'); },
    });

    const results = [];
    // retryMax(3) fires per call; volumeThreshold=10 and error threshold 50%,
    // so ~4 calls (12 failures, 100% error) must open the circuit.
    for (let i = 0; i < 11; i++) {
      results.push(await bitquery(datasetQuery(`retryme${i}`), ':ohlc', { feed: 'chart', priority: 'user' }));
    }

    assert.equal(calls >= 10, true, 'wire attempts happened before the breaker failed fast');
    assert.equal(breakerIsOpen(bitqueryBreaker), true, 'retryable failures still trip the circuit');
    assert.equal(results.every((r) => r.error), true);
  });
});