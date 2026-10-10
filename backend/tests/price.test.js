import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createSolPrice } from '../providers/solPrice.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('sol price cache', () => {
  test('serves a fresh value and reuses it without hitting upstream again', async () => {
    let calls = 0;
    const sp = createSolPrice({
      fetchSolPrice: async () => {
        calls += 1;
        return 182.41;
      },
      freshTtlMs: 60_000,
    });

    const a = await sp.get();
    assert.equal(a.data.price, 182.41);
    assert.equal(a.meta.fresh, true);
    assert.equal(a.meta.source, 'coingecko');

    const b = await sp.get();
    assert.equal(b.data.price, 182.41);
    assert.equal(b.meta.fresh, true);
    assert.equal(calls, 1, 'second read must not spend an upstream call');
  });

  test('serves the last known stale value while upstream is down', async () => {
    let mode = 'ok';
    const sp = createSolPrice({
      fetchSolPrice: async () => {
        if (mode === 'down') throw new Error('coinGecko down');
        return 42.5;
      },
      freshTtlMs: 1,
    });

    const first = await sp.get();
    assert.equal(first.data.price, 42.5);

    mode = 'down';
    await new Promise(r => setTimeout(r, 10));

    const stale = await sp.get();
    assert.equal(stale.data.price, 42.5);
    assert.equal(stale.meta.fresh, false, 'serve stale, not a fabricated fallback');
    assert.ok(stale.meta.fetchedAt != null);
  });

  test('reports no price when there is no cache and upstream fails', async () => {
    const sp = createSolPrice({
      fetchSolPrice: async () => {
        throw new Error('down');
      },
    });
    const result = await sp.get();
    assert.equal(result.data.price, null);
    assert.equal(result.meta.fetchedAt, null);
  });

  test('dedupes concurrent refreshes to a single upstream call', async () => {
    let calls = 0;
    const sp = createSolPrice({
      fetchSolPrice: async () => {
        calls += 1;
        await new Promise(r => setTimeout(r, 10));
        return 5;
      },
      freshTtlMs: 1_000,
    });

    const [x, y] = await Promise.all([sp.get(), sp.get()]);
    assert.equal(calls, 1, 'concurrent misses must share one inflight fetch');
    assert.equal(x.data.price, 5);
    assert.equal(y.data.price, 5);
  });
});

describe('price route wiring', () => {
  test('registers /api/price/sol on the router', () => {
    const routes = readFileSync(join(process.cwd(), 'routes', 'index.js'), 'utf8');
    assert.match(routes, /router\.get\('\/api\/price\/sol'/);
    assert.match(routes, /getPriceController/);
  });
});