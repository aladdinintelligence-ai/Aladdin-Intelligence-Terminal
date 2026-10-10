import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';

import config from '../configs/dataLayer.js';
import dl from '../providers/dataLayer.js';
import { getTokenDetailController } from '../controllers/token/tokenDetailController.js';
import { optionalAuth } from '../middleware/auth.js';
import coldBuildLimiter from '../services/coldBuildLimiter.js';

const { initDataLayer, resetCacheState } = dl;

const TRADE_ROW = {
  Block: { Time: '2026-10-01T00:00:00.000Z' },
  Trade: { Side: { Type: 'buy' }, Amount: '2', PriceInUSD: '1.5', Account: { Owner: 'WALLET1' } },
  Transaction: { Signature: 'SIG1' },
};

let bqCalls = [];
const healthyResolver = async (_query, label) => {
  bqCalls.push(label);
  return { data: { Solana: { DEXTradeByTokens: [TRADE_ROW] } } };
};

function makeRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
}

function reqFor(mint, tab = 'trades', extra = {}) {
  return { params: { mint }, query: { tab }, ip: '203.0.113.7', ...extra };
}

beforeEach(() => {
  resetCacheState();
  coldBuildLimiter.reset();
  bqCalls = [];
  initDataLayer({ bitqueryResolver: healthyResolver });
});

describe('cold-build limiter windows', () => {
  test('allows the configured cold builds per window per IP, then denies', () => {
    const now = 1_000_000_000;
    const cap = config.detailColdBuildRatePerMin;
    for (let i = 0; i < cap; i += 1) {
      const v = coldBuildLimiter.take(null, '198.51.100.1', now);
      assert.equal(v.allowed, true, `take ${i + 1} should fit in the window`);
    }
    const denied = coldBuildLimiter.take(null, '198.51.100.1', now);
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'ip_rate');
    assert.ok(denied.retryAfter >= 1);
    // another IP is an independent window
    assert.equal(coldBuildLimiter.take(null, '198.51.100.2', now).allowed, true);
  });

  test('the window slides: capacity returns once it elapses', () => {
    const t0 = 5_000_000_000;
    const cap = config.detailColdBuildRatePerMin;
    for (let i = 0; i < cap; i += 1) coldBuildLimiter.take(null, '198.51.100.3', t0);
    assert.equal(coldBuildLimiter.take(null, '198.51.100.3', t0).allowed, false);
    const afterWindow = t0 + config.detailColdBuildWindowMs + 1;
    assert.equal(coldBuildLimiter.take(null, '198.51.100.3', afterWindow).allowed, true);
  });

  test('one signed-in user is capped across every IP they use', () => {
    const now = 9_000_000_000;
    const cap = config.detailColdBuildRatePerMin;
    for (let i = 0; i < cap; i += 1) {
      const v = coldBuildLimiter.take('user-1', `198.51.100.${(i % 10) + 1}`, now);
      assert.equal(v.allowed, true);
    }
    const denied = coldBuildLimiter.take('user-1', '198.51.100.99', now);
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'user_rate');
    // a different user on that fresh IP is unaffected
    assert.equal(coldBuildLimiter.take('user-2', '198.51.100.99', now).allowed, true);
  });

  test('many users behind one IP share the IP cap', () => {
    const now = 7_000_000_000;
    const cap = config.detailColdBuildRatePerMin;
    for (let i = 0; i < cap; i += 1) {
      const v = coldBuildLimiter.take(`user-${i}`, '192.0.2.55', now);
      assert.equal(v.allowed, true);
    }
    const denied = coldBuildLimiter.take('brand-new-user', '192.0.2.55', now);
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'ip_rate');
    // same brand-new user from a fresh IP still passes
    assert.equal(coldBuildLimiter.take('brand-new-user', '192.0.2.56', now).allowed, true);
  });
});

describe('token-detail cold-build gate', () => {
  test('an allowed cold build spends exactly one Bitquery call and serves data', async () => {
    const res = makeRes();
    await getTokenDetailController(reqFor('COLDMINT1'), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].signature, 'SIG1');
    assert.equal(res.body.meta.tab, 'trades');
    assert.equal(bqCalls.length, 1);
  });

  test('a full cold first view (trades + stats tabs) costs two Bitquery calls', async () => {
    const trades = makeRes();
    await getTokenDetailController(reqFor('COLDMINT2', 'trades'), trades);
    const stats = makeRes();
    await getTokenDetailController(reqFor('COLDMINT2', 'stats'), stats);
    assert.equal(trades.statusCode, 200);
    assert.equal(stats.statusCode, 200);
    assert.equal(bqCalls.length, 2);
  });

  test('warm/cached polls still serve when the limiter is exhausted', async () => {
    const first = makeRes();
    await getTokenDetailController(reqFor('WARM1'), first);
    assert.equal(first.statusCode, 200);
    assert.equal(bqCalls.length, 1);

    // exhaust this IP's cold budget
    let guard = 0;
    while (coldBuildLimiter.take(null, '203.0.113.7', Date.now()).allowed && guard <= config.detailColdBuildRatePerMin + 2) guard += 1;
    assert.equal(coldBuildLimiter.take(null, '203.0.113.7', Date.now()).allowed, false);

    // the warm mint is served from cache anyway, with zero extra upstream calls
    const again = makeRes();
    await getTokenDetailController(reqFor('WARM1'), again);
    assert.equal(again.statusCode, 200);
    assert.equal(again.body.data.length, 1);
    assert.equal(bqCalls.length, 1);
  });

  test('above the limit a cold mint gets 429 and spends zero Bitquery calls', async () => {
    let guard = 0;
    while (coldBuildLimiter.take(null, '203.0.113.7', Date.now()).allowed && guard <= config.detailColdBuildRatePerMin + 2) guard += 1;
    assert.equal(coldBuildLimiter.take(null, '203.0.113.7', Date.now()).allowed, false);

    const res = makeRes();
    await getTokenDetailController(reqFor('COLDMINT3'), res);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.error, 'rate_limited');
    assert.equal(res.body.reason, 'ip_rate');
    assert.ok(Number(res.headers['Retry-After']) >= 1);
    assert.equal(bqCalls.length, 0);
  });

  test('concurrent cold requests for the same mint join one build (1 call)', async () => {
    let release;
    let hangCalls = 0;
    initDataLayer({
      bitqueryResolver: () => {
        hangCalls += 1;
        return new Promise((resolve) => {
          release = () => resolve({ data: { Solana: { DEXTradeByTokens: [TRADE_ROW] } } });
        });
      },
    });

    const r1 = makeRes();
    const p1 = getTokenDetailController(reqFor('COLDMINT4'), r1);
    for (let i = 0; i < 10 && !release; i += 1) await new Promise((r) => setImmediate(r));
    assert.equal(typeof release, 'function');

    const r2 = makeRes();
    const p2 = getTokenDetailController(reqFor('COLDMINT4'), r2);
    assert.equal(dl.hasInflight('detail:COLDMINT4:trades'), true);

    release();
    await Promise.all([p1, p2]);
    assert.equal(r1.statusCode, 200);
    assert.equal(r2.statusCode, 200);
    assert.equal(hangCalls, 1);
  });
});

describe('route + identity wiring for the cold-build limiter', () => {
  test('token-detail stays public but runs optionalAuth for the per-user window', () => {
    const routes = readFileSync(join(process.cwd(), 'routes', 'index.js'), 'utf8');
    assert.match(routes, /router\.get\('\/api\/token-detail\/:mint', optionalAuth, getTokenDetailController\)/);
    assert.match(routes, /import \{ requireAuth, requireAdmin, optionalAuth \}/);
  });

  test('optionalAuth attaches the user for a valid token', () => {
    const secret = process.env.JWT_SECRET || 'aladdin-dev-secret-change-in-production';
    const token = jwt.sign({ userId: 'user-42' }, secret, { expiresIn: '10m' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    let nextCalled = false;
    optionalAuth(req, {}, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.user.userId, 'user-42');
  });

  test('optionalAuth stays anonymous without a token or with a bad one', () => {
    let nextCalled = false;
    const anon = { headers: {} };
    optionalAuth(anon, {}, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(anon.user, undefined);

    const bad = { headers: { authorization: 'Bearer not-a-jwt' } };
    nextCalled = false;
    optionalAuth(bad, {}, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(bad.user, undefined);
  });
});
