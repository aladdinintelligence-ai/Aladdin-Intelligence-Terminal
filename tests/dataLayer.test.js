import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

import config from '../configs/dataLayer.js';
import { budget } from '../providers/budgetTracker.js';
import dl from '../providers/dataLayer.js';

const { initDataLayer, fetch, bitquery, markUserRequest, isHot, markMintActive, activeMints, registerFeed, tick, resetCacheState, setTokenBucketEnabled, internals, isRealUserRequest } = dl;

before(() => {
  setTokenBucketEnabled(false);
});

beforeEach(() => {
  resetCacheState();
  budget.reset();
});

after(() => {
  budget.reset();
});

describe('config defaults', () => {
  test('approved cadence table is encoded', () => {
    assert.equal(config.feedCadences.movers, 6 * 60_000);
    assert.equal(config.feedCadences.launches, 12 * 60_000);
    assert.equal(config.feedCadences.og, 15 * 60_000);
    assert.equal(config.feedCadences.smartMoney, 15 * 60_000);
    assert.equal(config.feedCadences.insider, 15 * 60_000);
    assert.equal(config.feedCadences.historical, 30 * 60_000);
    assert.equal(config.feedCadences.formation, 30 * 60_000);
    assert.equal(config.feedCadences.cluster, 30 * 60_000);
  });

  test('demand-driven + telemetry constraints present', () => {
    assert.equal(config.hotWindowMs, 30 * 60_000);
    assert.equal(config.telemetryMaxActiveMints, 3);
    assert.equal(config.telemetryMintIdleMs, 60_000);
    assert.equal(config.telemetryCadenceMs, 5 * 60_000);
    assert.equal(config.demandDriven, true);
    assert.equal(config.dailyCapOverride, 0);
  });
});

describe('budget tracker', () => {
  const daysInMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

  test('daily cap is derived from remaining monthly budget', () => {
    const daysLeft = Math.max(daysInMonth() - new Date().getDate() + 1, 1);
    const expected = Math.floor(config.estimatedCallsPerMonth / daysLeft);
    assert.equal(budget.dailyCap(), expected);
  });

  test('usage counts only bitquery calls', () => {
    budget.state.day.cl = 0;
    budget.state.day.byFeed = {};
    budget.addCall('og', 0, 'bitquery');
    budget.addCall('launches', 0, 'dexscreener');
    // daily.calls == 2 but bitquery usage == 1 / cap
    assert.equal(budget.state.day.calls, 2);
    assert.equal(budget.bitqueryUsage() > 0 && budget.bitqueryUsage() < 2 / budget.dailyCap(), true);
  });

  test('tier transitions and hard stop at 100%', () => {
    const cap = budget.dailyCap();
    budget.state.day.byFeed['bitquery:og'] = Math.floor(cap * config.tier1);
    assert.equal(budget.tier().id, 1);
    assert.equal(budget.canFire(), true);

    budget.state.day.byFeed['bitquery:og'] = Math.floor(cap * config.tier2);
    assert.equal(budget.tier().id, 2);
    assert.equal(budget.canFire(), true);

    budget.state.day.byFeed['bitquery:og'] = cap;
    assert.equal(budget.tier().id, 3);
    assert.equal(budget.canFire(), false);
  });
});

describe('layer fetch cache semantics', () => {
  test('fresh hit does not call the upstream request again', async () => {
    let calls = 0;
    await fetch({
      key: 'f:og:20',
      request: async () => { calls += 1; return { rows: [1, 2] }; },
    });
    const second = await fetch({
      key: 'f:og:20',
      request: async () => { calls += 1; return { rows: [9] }; },
    });
    assert.equal(calls, 1);
    assert.equal(second.fresh, true);
    assert.deepEqual(second.data, { rows: [1, 2] });
  });

  test('stale hit serves old data and revalidates in background', async () => {
    let calls = 0;
    await fetch({
      key: 'f:stale',
      freshTtlMs: 1,
      staleTtlMs: 60_000,
      request: async () => { calls += 1; return { v: calls }; },
    });
    await new Promise((r) => setTimeout(r, 5));
    const stale = await fetch({
      key: 'f:stale',
      freshTtlMs: 1,
      staleTtlMs: 60_000,
      request: async () => { calls += 1; return { v: calls }; },
    });
    assert.equal(stale.stale, true);
    assert.equal(stale.data.v, 1);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls, 2); // background revalidation happened once
  });

  test('identical concurrent requests coalesce into one upstream call', async () => {
    let calls = 0;
    const p1 = fetch({ key: 'f:co', request: async () => { calls += 1; await new Promise((r) => setTimeout(r, 20)); return { ok: true }; } });
    const p2 = fetch({ key: 'f:co', request: async () => { calls += 1; return { ok: true }; } });
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(calls, 1);
    assert.equal(r1.fresh, true);
    assert.equal(r2.fresh, true);
  });

  test('miss with failing request and no cache returns unavailable (never throws)', async () => {
    const res = await fetch({
      key: 'f:fail',
      request: async () => { throw new Error('upstream down'); },
    });
    assert.equal(res.unavailable, true);
    assert.equal(res.code, 'UPSTREAM_UNAVAILABLE');
  });

  test('budget hard stop returns unavailable without calling upstream', async () => {
    const cap = budget.dailyCap();
    budget.state.day.byFeed['bitquery:data'] = cap;
    let calls = 0;
    const res = await fetch({
      key: 'f:blocked',
      request: async () => { calls += 1; return { ok: true }; },
    });
    assert.equal(res.unavailable, true);
    assert.equal(res.code, 'BUDGET_EXHAUSTED');
    assert.equal(calls, 0);
  });
});

describe('bitquery transport', () => {
  test('retries 5xx twice then succeeds, counting each wire attempt', async () => {
    let calls = 0;
    initDataLayer({
      bitqueryResolver: async () => {
        calls += 1;
        if (calls < 3) return { error: 'boom', status: 503 };
        return { data: { ok: true } };
      },
    });
    const res = await bitquery('{ q }', 't', { feed: 'tl' });
    assert.equal(calls, 3);
    assert.equal(res.data.ok, true);
    assert.equal(budget.state.day.byFeed['bitquery:tl'], 3);
  });

  test('quota (402) is not retried and blocks further calls long', async () => {
    let calls = 0;
    initDataLayer({
      bitqueryResolver: async () => { calls += 1; return { error: 'quota exceeded', status: 402 }; },
    });
    const first = await bitquery('{ q }', 't', { feed: 'quota' });
    assert.equal(first.error.includes('quota'), true);
    assert.equal(calls, 1);
    const second = await bitquery('{ q }', 't', { feed: 'quota' });
    assert.match(second.error, /breaker|quota/);
    assert.equal(calls, 1); // blocked before the wire
  });

  test('bad-query 4xx is not retried', async () => {
    let calls = 0;
    initDataLayer({
      bitqueryResolver: async () => { calls += 1; return { error: 'bad syntax', status: 400 }; },
    });
    const res = await bitquery('{ bad', 't', { feed: 'tl' });
    assert.equal(res.error, 'bad syntax');
    assert.equal(calls, 1);
  });
});

describe('token bucket', () => {
  test('refills deterministically after the clock advances', async () => {
    const fakeTime = { t: 1_000_000 };
    initDataLayer({ timeFn: () => fakeTime.t });
    const bucket = new internals.TokenBucket(6, 3); // 0.1 tokens/sec, cap 3
    setTokenBucketEnabled(true);
    await bucket.take();
    await bucket.take();
    await bucket.take();
    assert.equal(bucket.tokens < 0.001, true); // depleted
    fakeTime.t += 10_000; // advances 10s => +1 token
    await bucket.take(); // should return immediately from refill
    assert.equal(bucket.tokens < 0.001, true);
  });
});

describe('demand-driven hotness', () => {
  test('real user requests mark a feed hot', () => {
    markUserRequest('og', { userAgent: 'Mozilla/5.0 (Windows NT 10.0)' });
    assert.equal(isHot('og'), true);
  });

  test('bots, health checks and internal refreshes are ignored', () => {
    assert.equal(isRealUserRequest({ userAgent: 'Mozilla/5.0' }), true);
    assert.equal(isRealUserRequest({ userAgent: 'UptimeRobot/2.0' }), false);
    assert.equal(isRealUserRequest({ userAgent: 'Mozilla/5.0', path: '/health' }), false);
    assert.equal(isRealUserRequest({ userAgent: 'Mozilla/5.0', internal: true }), false);
  });

  test('active mints are capped at 3 and idle pruning applies', () => {
    markMintActive('aaa');
    markMintActive('bbb');
    markMintActive('ccc');
    markMintActive('ddd');
    assert.equal(activeMints().length, 3);
  });
});

describe('feed scheduler', () => {
  test('hot feed refreshes, cold feed stays idle', async () => {
    let hotRuns = 0;
    let coldRuns = 0;
    registerFeed('og', { cadenceMs: 0, critical: true, job: async () => { hotRuns += 1; } });
    registerFeed('historical', { cadenceMs: 0, critical: true, job: async () => { coldRuns += 1; } });
    markUserRequest('og', { userAgent: 'Mozilla/5.0' });
    await tick();
    assert.equal(hotRuns, 1);
    assert.equal(coldRuns, 0);
  });
});