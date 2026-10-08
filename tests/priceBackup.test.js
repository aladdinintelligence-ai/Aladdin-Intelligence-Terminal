import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createSolPriceStore, SOL_USD_BACKUP } from '../services/solPriceStore.js';
import { createPriceController } from '../controllers/priceController.js';

function fakeModel({ doc = null, findByIdError = null, updateError = null } = {}) {
  const calls = { findById: 0, updateOne: [] };
  return {
    calls,
    findById(id) {
      calls.findById += 1;
      calls.lastId = id;
      return {
        lean: () => (findByIdError ? Promise.reject(findByIdError) : Promise.resolve(doc)),
      };
    },
    async updateOne(filter, update, opts) {
      calls.updateOne.push({ filter, update, opts });
      if (updateError) throw updateError;
      return { acknowledged: true };
    },
  };
}

function fakeRes() {
  const res = { body: null, statusCode: 200 };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

describe('sol price DB backup store', () => {
  test('seeds the $100 backup when no doc exists yet', async () => {
    const model = fakeModel({ doc: null });
    const store = createSolPriceStore({ model, isConnected: () => true });
    const out = await store.readBackup();
    assert.deepEqual(out, { price: SOL_USD_BACKUP, fetchedAt: null });
    assert.equal(model.calls.lastId, 'sol-usd');
    assert.equal(model.calls.updateOne.length, 1);
    assert.deepEqual(model.calls.updateOne[0].update.$setOnInsert, { price: SOL_USD_BACKUP });
    assert.equal(model.calls.updateOne[0].opts.upsert, true);
  });

  test('returns the stored price and its updatedAt', async () => {
    const when = new Date('2026-10-08T10:00:00.000Z');
    const model = fakeModel({ doc: { _id: 'sol-usd', price: 163.4, updatedAt: when } });
    const store = createSolPriceStore({ model, isConnected: () => true });
    const out = await store.readBackup();
    assert.deepEqual(out, { price: 163.4, fetchedAt: when });
    assert.equal(model.calls.updateOne.length, 0, 'must not reseed when a price exists');
  });

  test('read falls back to $100 when the query fails', async () => {
    const model = fakeModel({ findByIdError: new Error('mongo down') });
    const store = createSolPriceStore({ model, isConnected: () => true });
    const out = await store.readBackup();
    assert.equal(out.price, SOL_USD_BACKUP);
  });

  test('read skips the model entirely when the DB is disconnected', async () => {
    const model = fakeModel();
    const store = createSolPriceStore({ model, isConnected: () => false });
    const out = await store.readBackup();
    assert.equal(out.price, SOL_USD_BACKUP);
    assert.equal(model.calls.findById, 0);
    assert.equal(model.calls.updateOne.length, 0);
  });

  test('write persists the current price via upsert', async () => {
    const model = fakeModel();
    const store = createSolPriceStore({ model, isConnected: () => true });
    await store.writeBackup(164.2);
    assert.equal(model.calls.updateOne.length, 1);
    const { filter, update, opts } = model.calls.updateOne[0];
    assert.deepEqual(filter, { _id: 'sol-usd' });
    assert.deepEqual(update.$set, { price: 164.2 });
    assert.equal(opts.upsert, true);
  });

  test('write ignores invalid prices (NaN, 0, negative)', async () => {
    const model = fakeModel();
    const store = createSolPriceStore({ model, isConnected: () => true });
    await store.writeBackup(NaN);
    await store.writeBackup(0);
    await store.writeBackup(-5);
    assert.equal(model.calls.updateOne.length, 0);
  });

  test('write never throws when the model fails or the DB is down', async () => {
    const failing = createSolPriceStore({ model: fakeModel({ updateError: new Error('nope') }), isConnected: () => true });
    await assert.doesNotReject(() => failing.writeBackup(160));
    const disconnected = createSolPriceStore({ model: fakeModel(), isConnected: () => false });
    await assert.doesNotReject(() => disconnected.writeBackup(160));
  });
});

describe('price controller', () => {
  const backupStore = (price = SOL_USD_BACKUP, fetchedAt = null) => ({
    readBackup: async () => ({ price, fetchedAt }),
    writeBackup: async () => {},
  });

  test('live price is returned and persisted to the backup', async () => {
    const written = [];
    const controller = createPriceController({
      solPrice: { get: async () => ({ data: { price: 165.5 }, meta: { source: 'coingecko', fetchedAt: 't1', fresh: true } }) },
      store: { readBackup: async () => ({ price: 100, fetchedAt: null }), writeBackup: async (p) => { written.push(p); } },
    });
    const res = fakeRes();
    await controller({}, res);
    assert.deepEqual(written, [165.5]);
    assert.equal(res.body.data.price, 165.5);
    assert.equal(res.body.meta.fresh, true);
    assert.equal(res.statusCode, 200);
  });

  test('upstream failure returns the DB backup with 200 (no 503)', async () => {
    const when = '2026-10-08T09:59:00.000Z';
    const controller = createPriceController({
      solPrice: { get: async () => ({ data: { price: null }, meta: { source: 'coingecko', fetchedAt: null, fresh: false } }) },
      store: backupStore(164.8, when),
    });
    const res = fakeRes();
    await controller({}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.price, 164.8);
    assert.equal(res.body.meta.source, 'db-backup');
    assert.equal(res.body.meta.fresh, false);
    assert.equal(res.body.meta.fetchedAt, when);
  });

  test('a throwing solPrice.get still yields the DB backup', async () => {
    const controller = createPriceController({
      solPrice: { get: async () => { throw new Error('boom'); } },
      store: backupStore(100),
    });
    const res = fakeRes();
    await controller({}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.price, 100);
    assert.equal(res.body.meta.source, 'db-backup');
  });

  test('a failing backup write never hides the live price', async () => {
    const controller = createPriceController({
      solPrice: { get: async () => ({ data: { price: 166.1 }, meta: { source: 'coingecko', fetchedAt: 't1', fresh: true } }) },
      store: {
        readBackup: async () => ({ price: 100, fetchedAt: null }),
        writeBackup: async () => { throw new Error('write failed'); },
      },
    });
    const res = fakeRes();
    await controller({}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.price, 166.1);
  });
});
