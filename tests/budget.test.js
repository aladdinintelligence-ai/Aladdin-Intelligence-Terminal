import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getBudgetController } from '../controllers/budget/budgetController.js';
import { budget } from '../providers/budgetTracker.js';

describe('budget endpoint', () => {
  test('registers /api/internal/budget behind requireAuth on the router', () => {
    const routes = readFileSync(join(process.cwd(), 'routes', 'index.js'), 'utf8');
    assert.match(routes, /router\.get\('\/api\/internal\/budget'/);
    assert.match(routes, /requireAuth/);
    assert.match(routes, /getBudgetController/);
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