import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import dl from '../providers/dataLayer.js';
import { fetchTrendingTokens } from '../providers/index.js';

// Regression: fetchTrendingTokens used a positional (limit, hours, opts)
// signature while launchesController calls every launches fetcher uniformly
// as fetcher(limit, FETCH_OPTS). The options object landed in `hours`,
// sinceIso computed NaN, and new Date(NaN).toISOString() crashed the whole
// trending build with RangeError: Invalid time value.

describe('launches trending fetcher argument shapes', () => {
  let captured;

  beforeEach(() => {
    captured = [];
    dl.resetCacheState();
    dl.initDataLayer({
      bitqueryResolver: async (query) => {
        captured.push(query);
        return { data: { Solana: { trades: [] } } };
      },
    });
  });

  const sinceFromCaptured = () => {
    const m = captured[0].match(/since: "([^"]+)"/);
    assert.ok(m, 'vol query must scope a since window');
    const t = Date.parse(m[1]);
    assert.ok(!Number.isNaN(t), `since must be a valid timestamp, got: ${m[1]}`);
    return t;
  };

  test('controller call shape (limit, FETCH_OPTS) resolves instead of throwing', async () => {
    const res = await fetchTrendingTokens(50, { feed: 'launches', priority: 'user' });
    assert.equal(res.error, null);
    assert.deepEqual(res.tokens, []);
    const ageHours = (Date.now() - sinceFromCaptured()) / 3600000;
    assert.ok(Math.abs(ageHours - 1) < 0.1, `default window must be ~1h, got ${ageHours}h`);
  });

  test('hours inside the options object is honored', async () => {
    const res = await fetchTrendingTokens(50, { hours: 24, feed: 'launches' });
    assert.equal(res.error, null);
    const ageHours = (Date.now() - sinceFromCaptured()) / 3600000;
    assert.ok(Math.abs(ageHours - 24) < 0.1, `window must be ~24h, got ${ageHours}h`);
  });

  test('bare (limit) call shape still defaults to the 1h window', async () => {
    const res = await fetchTrendingTokens(50);
    assert.equal(res.error, null);
    const ageHours = (Date.now() - sinceFromCaptured()) / 3600000;
    assert.ok(Math.abs(ageHours - 1) < 0.1, `default window must be ~1h, got ${ageHours}h`);
  });

  test('garbage hours degrades to the 1h window instead of crashing', async () => {
    const res = await fetchTrendingTokens(50, { hours: 'bogus', feed: 'launches' });
    assert.equal(res.error, null);
    const ageHours = (Date.now() - sinceFromCaptured()) / 3600000;
    assert.ok(Math.abs(ageHours - 1) < 0.1, `fallback window must be ~1h, got ${ageHours}h`);
  });
});
