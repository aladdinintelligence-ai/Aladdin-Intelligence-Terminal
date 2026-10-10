import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getBudgetController, resetBudgetController } from '../controllers/budget/budgetController.js';
import { requireAdmin } from '../middleware/auth.js';
import dl from '../providers/dataLayer.js';
import { budget } from '../providers/budgetTracker.js';

describe('budget endpoint', () => {
  test('registers /api/internal/budget behind requireAuth + requireAdmin on the router', () => {
    const routes = readFileSync(join(process.cwd(), 'routes', 'index.js'), 'utf8');
    assert.match(routes, /import \{[^}]*\brequireAdmin\b[^}]*\} from '\.\.\/middleware\/auth\.js'/);
    assert.match(routes, /router\.get\('\/api\/internal\/budget', requireAuth, requireAdmin, getBudgetController\)/);
  });

  test('registers the admin-only reset POST on the router', () => {
    const routes = readFileSync(join(process.cwd(), 'routes', 'index.js'), 'utf8');
    assert.match(routes, /router\.post\('\/api\/internal\/budget\/reset', requireAuth, requireAdmin, resetBudgetController\)/);
  });

  test('returns a budget snapshot, breaker state and fresh-usage view', () => {
    let body;
    const res = { json: (b) => { body = b; } };
    getBudgetController({}, res);
    assert.equal(typeof body.snapshot.tier.id, 'number');
    assert.equal(typeof body.snapshot.daily.cap, 'number');
    assert.equal(typeof body.breaker.bitquery, 'boolean');
    assert.equal(typeof body.breaker.dexscreener, 'boolean');
    assert.equal(typeof body.breaker.authBlockedUntil, 'number');
    assert.equal(typeof body.breaker.quotaBlockedUntil, 'number');
    assert.equal(typeof body.breaker.dexQuotaBlockedUntil, 'number');
    assert.ok(Array.isArray(body.activeMints));
    assert.equal(typeof body.feeds, 'object');
  });

  test('reset controller clears an open auth block so traffic resumes without restart', async () => {
    let calls = 0;
    let healthy = false;
    dl.initDataLayer({
      bitqueryResolver: async () => {
        calls += 1;
        if (!healthy) return { error: 'Unauthorized', status: 401 };
        return { data: { ok: true } };
      },
    });
    const origError = console.error;
    console.error = () => {};
    try {
      await dl.bitquery('{ q }', 't', { feed: 'resetTest' });
      assert.ok(dl.internals.authOpenUntil() > Date.now());
      const blocked = await dl.bitquery('{ q }', 't', { feed: 'resetTest' });
      assert.match(blocked.error, /breaker/);
      assert.equal(calls, 1);

      let body;
      resetBudgetController({}, { json: (b) => { body = b; } });
      assert.equal(body.ok, true);
      assert.equal(body.authBlockedUntil, 0);
      assert.equal(body.quotaBlockedUntil, 0);
      assert.equal(body.dexQuotaBlockedUntil, 0);
      assert.equal(dl.internals.authOpenUntil(), 0);

      healthy = true;
      const resumed = await dl.bitquery('{ q }', 't', { feed: 'resetTest' });
      assert.equal(resumed.stale, false);
      assert.equal(calls, 2);
    } finally {
      console.error = origError;
      dl.resetCacheState();
      budget.reset();
    }
  });

  test('budget snapshot reflects a recorded call for the current day', () => {
    budget.addCall('probe', 0, 'bitquery');
    const s = budget.snapshot();
    assert.equal(s.daily.calls >= 1, true);
    assert.equal(s.daily.byFeed['bitquery:probe'] >= 1, true);
    budget.reset();
  });
});

describe('requireAdmin (ADMIN_USER_IDS)', () => {
  const makeRes = () => {
    const res = { statusCode: 200, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
  };
  const prev = process.env.ADMIN_USER_IDS;

  after(() => {
    if (prev === undefined) delete process.env.ADMIN_USER_IDS;
    else process.env.ADMIN_USER_IDS = prev;
  });

  test('authenticated non-admin gets 403 and next() is never called', () => {
    process.env.ADMIN_USER_IDS = 'admin-1,admin-2';
    const res = makeRes();
    let nextCalled = false;
    requireAdmin({ user: { userId: 'regular-user' } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.match(res.body.error, /Admin/);
  });

  test('id listed in ADMIN_USER_IDS passes through', () => {
    process.env.ADMIN_USER_IDS = 'admin-1,admin-2';
    const res = makeRes();
    let nextCalled = false;
    requireAdmin({ user: { userId: 'admin-2' } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200); // untouched: no denial written
  });

  test('request without a user is rejected too', () => {
    process.env.ADMIN_USER_IDS = 'admin-1';
    const res = makeRes();
    let nextCalled = false;
    requireAdmin({}, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  test('unset ADMIN_USER_IDS denies everyone', () => {
    delete process.env.ADMIN_USER_IDS;
    const res = makeRes();
    let nextCalled = false;
    requireAdmin({ user: { userId: 'admin-1' } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });
});