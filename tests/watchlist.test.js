import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createWatchlistStore } from '../services/watchlistStore.js';
import { createWatchlistController } from '../controllers/watchlist/watchlistController.js';

const MINT_A = 'HKZDfZnkHZxd9agRDNPyDv4iT6LmAurJnpRtj9wpump';
const MINT_B = 'AzKZfZnkHZxd9agRDNPyDv4iT6LmAurJnpRtj9wpump';

function matches(doc, query) {
  return Object.entries(query).every(([key, value]) => {
    if (key === 'items.mint') return doc.items.some((i) => i.mint === value);
    return doc[key] === value;
  });
}

function makeFakeModel(seed = []) {
  const docs = seed.map((d) => ({ items: [], ...d, createdAt: new Date() }));
  return {
    docs,
    async findOne(query) {
      return docs.find((d) => matches(d, query)) || null;
    },
    async findOneAndUpdate(query, update, opts = {}) {
      let doc = docs.find((d) => matches(d, query));
      if (!doc) {
        if (!opts.upsert) return null;
        doc = { userId: query.userId, items: [], createdAt: new Date() };
        docs.push(doc);
      }
      if (update.$push) doc.items.push({ createdAt: new Date(), ...update.$push.items });
      if (update.$pull) doc.items = doc.items.filter((i) => i.mint !== update.$pull.items.mint);
      return doc;
    },
  };
}

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

async function run(fn, req) {
  const res = fakeRes();
  let nextErr = null;
  await fn(req, res, (e) => { nextErr = e; });
  if (nextErr) throw nextErr;
  return res;
}

describe('watchlist store', () => {
  test('add is idempotent: first add created, second is a no-op', async () => {
    const model = makeFakeModel();
    const store = createWatchlistStore({ model });

    const first = await store.add('u1', { mint: MINT_A, symbol: 'AAA' });
    assert.equal(first.added, true);
    const second = await store.add('u1', { mint: MINT_A, symbol: 'AAA' });
    assert.equal(second.added, false);

    const items = await store.list('u1');
    assert.equal(items.length, 1);
    assert.equal(items[0].mint, MINT_A);
  });

  test('list is scoped per user', async () => {
    const model = makeFakeModel();
    const store = createWatchlistStore({ model });
    await store.add('alice', { mint: MINT_A });
    await store.add('bob', { mint: MINT_B });

    const alice = await store.list('alice');
    const bob = await store.list('bob');
    assert.deepEqual(alice.map((i) => i.mint), [MINT_A]);
    assert.deepEqual(bob.map((i) => i.mint), [MINT_B]);
    assert.deepEqual(await store.list('stranger'), []);
  });

  test('remove reports whether anything was removed', async () => {
    const model = makeFakeModel();
    const store = createWatchlistStore({ model });
    await store.add('u1', { mint: MINT_A });

    assert.deepEqual(await store.remove('u1', MINT_A), { removed: true });
    assert.deepEqual(await store.remove('u1', MINT_A), { removed: false });
    assert.deepEqual(await store.list('u1'), []);
    // Removing from an empty/other user's list is a safe no-op.
    assert.deepEqual(await store.remove('u2', MINT_A), { removed: false });
  });

  test('add refuses items beyond the 100-token limit', async () => {
    const model = makeFakeModel([{
      userId: 'u1',
      items: Array.from({ length: 100 }, (_, i) => ({ mint: `mint-${i}` })),
    }]);
    const store = createWatchlistStore({ model });
    const outcome = await store.add('u1', { mint: MINT_A });
    assert.equal(outcome.error, 'Watchlist limit reached (100)');
    assert.equal(outcome.status, 400);
    assert.equal((await store.list('u1')).length, 100);
  });
});

describe('watchlist controller', () => {
  test('GET merges live DexScreener stats over the stored snapshot', async () => {
    const model = makeFakeModel([{
      userId: 'u1',
      items: [{ mint: MINT_A, symbol: 'OLD', priceUsd: 0.1, imageUrl: 'stored.png' }],
    }]);
    const store = createWatchlistStore({ model });
    const calls = [];
    const controller = createWatchlistController({
      store,
      dexBatch: async (mints, opts) => {
        calls.push({ mints, opts });
        return {
          [MINT_A]: [{
            baseToken: { address: MINT_A, symbol: 'NEW', name: 'New Token' },
            priceUsd: '1.25',
            marketCap: '9000000',
            volume: { h24: 5000 },
            priceChange: { h24: -4.2 },
            info: { imageUrl: 'live.png' },
          }],
        };
      },
    });

    const res = await run(controller.getWatchlistController, { user: { userId: 'u1' } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.items.length, 1);
    const item = res.body.items[0];
    assert.equal(item.live, true);
    assert.equal(item.symbol, 'NEW');
    assert.equal(item.name, 'New Token');
    assert.equal(item.imageUrl, 'live.png');
    assert.equal(item.priceUsd, 1.25);
    assert.equal(item.marketCapUsd, 9000000);
    assert.equal(item.volume24h, 5000);
    assert.equal(item.priceChange24h, -4.2);
    // Upstream asked once for every saved mint with the watchlist feed.
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].mints, [MINT_A]);
    assert.equal(calls[0].opts.feed, 'watchlist');
  });

  test('GET still serves stored data when DexScreener is down', async () => {
    const model = makeFakeModel([{
      userId: 'u1',
      items: [{ mint: MINT_A, symbol: 'AAA', priceUsd: 0.42, volume24h: 123 }],
    }]);
    const store = createWatchlistStore({ model });
    const controller = createWatchlistController({
      store,
      dexBatch: async () => ({ error: 'dexscreener breaker open', status: 503 }),
    });

    const res = await run(controller.getWatchlistController, { user: { userId: 'u1' } });
    assert.equal(res.statusCode, 200);
    const item = res.body.items[0];
    assert.equal(item.live, false);
    assert.equal(item.symbol, 'AAA');
    assert.equal(item.priceUsd, 0.42);
    assert.equal(item.volume24h, 123);
  });

  test('GET on an empty watchlist skips the upstream entirely', async () => {
    const model = makeFakeModel();
    const store = createWatchlistStore({ model });
    let calls = 0;
    const controller = createWatchlistController({
      store,
      dexBatch: async () => { calls += 1; return {}; },
    });

    const res = await run(controller.getWatchlistController, { user: { userId: 'u1' } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.items, []);
    assert.equal(calls, 0);
  });

  test('POST adds a token for the signed-in user and is idempotent', async () => {
    const model = makeFakeModel();
    const store = createWatchlistStore({ model });
    const controller = createWatchlistController({ store, dexBatch: async () => ({}) });
    const req = {
      user: { userId: 'u1' },
      params: { mint: MINT_A },
      body: { symbol: 'AAA', name: 'Token A', imageUrl: 'a.png', priceUsd: '0.5' },
    };

    const first = await run(controller.addWatchlistController, req);
    assert.equal(first.statusCode, 200);
    assert.equal(first.body.added, true);
    assert.equal(first.body.item.symbol, 'AAA');
    assert.equal(first.body.item.priceUsd, 0.5);

    const second = await run(controller.addWatchlistController, req);
    assert.equal(second.body.added, false);

    const list = await run(controller.getWatchlistController, { user: { userId: 'u1' } });
    assert.equal(list.body.items.length, 1);
  });

  test('POST rejects a malformed mint with 400', async () => {
    const model = makeFakeModel();
    const store = createWatchlistStore({ model });
    const controller = createWatchlistController({ store, dexBatch: async () => ({}) });

    const res = await run(controller.addWatchlistController, {
      user: { userId: 'u1' },
      params: { mint: 'too-short' },
      body: {},
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Invalid mint address');
  });

  test('DELETE removes only the caller\'s token', async () => {
    const model = makeFakeModel([
      { userId: 'u1', items: [{ mint: MINT_A }, { mint: MINT_B }] },
    ]);
    const store = createWatchlistStore({ model });
    const controller = createWatchlistController({ store, dexBatch: async () => ({}) });

    const wrongUser = await run(controller.removeWatchlistController, {
      user: { userId: 'u2' },
      params: { mint: MINT_A },
    });
    assert.deepEqual(wrongUser.body, { removed: false });

    const owner = await run(controller.removeWatchlistController, {
      user: { userId: 'u1' },
      params: { mint: MINT_A },
    });
    assert.deepEqual(owner.body, { removed: true });
    const remaining = await store.list('u1');
    assert.deepEqual(remaining.map((i) => i.mint), [MINT_B]);
  });

  test('all watchlist routes require auth', () => {
    const routes = fs.readFileSync(new URL('../routes/index.js', import.meta.url), 'utf8');
    for (const [method, path] of [
      ['get', '/api/watchlist'],
      ['post', '/api/watchlist/:mint'],
      ['delete', '/api/watchlist/:mint'],
    ]) {
      const line = routes.split('\n').find((l) => l.includes(`router.${method}('${path}'`));
      assert.ok(line, `missing route ${method.toUpperCase()} ${path}`);
      assert.match(line, /requireAuth/, `${method.toUpperCase()} ${path} must use requireAuth`);
    }
  });
});
