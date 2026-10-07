import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getBudgetController } from '../controllers/budget/budgetController.js';
import { requireAdmin } from '../middleware/auth.js';
import { budget } from '../providers/budgetTracker.js';

describe('budget endpoint', () => {
  test('registers /api/internal/budget behind requireAuth + requireAdmin on the router', () => {
    const routes = readFileSync(join(process.cwd(), 'routes', 'index.js'), 'utf8');
    assert.match(routes, /import \{ requireAuth, requireAdmin \}/);
    assert.match(routes, /router\.get\('\/api\/internal\/budget', requireAuth, requireAdmin, getBudgetController\)/);
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
    assert.ok(Array.isArray(body.activeMints));
    assert.equal(typeof body.feeds, 'object');
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