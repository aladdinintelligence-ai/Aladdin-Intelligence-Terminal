import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import dl from '../providers/dataLayer.js';
import { getLaunchesController } from '../controllers/launches/launchesController.js';
import { Token } from '../models/token.model.js';

// Regression: fetchNewTokens / fetchMigratedTokens built tokens with a hard
// 0 volume (the volume helper fetchVolumeForMints was never wired in), so the
// New and Migrated tabs always showed "VOL $0". Age values were also rounded
// to whole minutes on the server, so brand-new tokens (<30s old) displayed
// "0m" and lost their seconds. Volume was observed at the /api/launches level.

const MINT = '2xTESTmintpump';
const NOW_MS = Date.now();
const SUPPLY_TIME = new Date(NOW_MS - 30_000).toISOString();
const MIGRATION_TIME = new Date(NOW_MS - 40_000).toISOString();

function makeRes() {
  const st = { statusCode: 200 };
  return {
    status(code) { st.statusCode = code; return this; },
    json(body) { st.body = body; return body; },
    get __st() { return st; },
  };
}

// Bitquery request dispatcher: answers each query kind with a minimal fixture
// so the full build pipeline (fetcher -> mapper -> controller) runs for real.
function fixtureResolver(query) {
  const empty = (key) => ({ data: { Solana: { [key]: [] } } });

  if (query.includes('TokenSupplyUpdates')) {
    return {
      data: {
        Solana: {
          supply: [{
            Block: { Time: SUPPLY_TIME },
            TokenSupplyUpdate: {
              Currency: { MintAddress: MINT, Name: 'Test Token', Symbol: 'TEST' },
              PostBalanceInUSD: '12000',
            },
          }],
        },
      },
    };
  }

  if (query.includes('BalanceUpdates')) {
    return {
      data: {
        Solana: {
          BalanceUpdates: [
            { BalanceUpdate: { Currency: { MintAddress: MINT }, Account: { Address: 'a1' }, PostBalance: '100' } },
            { BalanceUpdate: { Currency: { MintAddress: MINT }, Account: { Address: 'a2' }, PostBalance: '50' } },
          ],
        },
      },
    };
  }

  if (query.includes('DEXPools')) {
    return {
      data: {
        Solana: {
          DEXPools: [{
            Block: { Time: MIGRATION_TIME },
            Pool: {
              Market: { BaseCurrency: { MintAddress: MINT, Name: 'Test Token', Symbol: 'TEST' }, MarketAddress: 'MKT' },
              Base: { PostAmount: '200', PostAmountInUSD: '12000' },
              Quote: { PostAmount: '80', PriceInUSD: '1.5', PostAmountInUSD: '120' },
            },
          }],
        },
      },
    };
  }

  if (query.includes('VolumeInUSD')) {
    return {
      data: {
        Solana: {
          DEXTradeByTokens: [{ VolumeInUSD: '700.5', Trade: { Currency: { MintAddress: MINT } } }],
        },
      },
    };
  }

  if (query.includes('TxCount')) {
    return {
      data: {
        Solana: {
          DEXTradeByTokens: [{ TxCount: '12', Trade: { Currency: { MintAddress: MINT } } }],
        },
      },
    };
  }

  return empty('trades');
}

async function loadTab(tab, limit = 5) {
  dl.resetCacheState();
  dl.initDataLayer({ bitqueryResolver: fixtureResolver });
  const res = makeRes();
  await getLaunchesController({ query: { tab, limit } }, res, () => {});
  return res.__st;
}

describe('launches new/migrated volume and age precision', () => {
  beforeEach(() => {
    dl.resetCacheState();
    dl.initDataLayer({ bitqueryResolver: fixtureResolver });
    // Image enrichment queries Mongo; stub a hit so enrichment skips down and
    // never reaches the real DexScreener fetch.
    mock.method(Token, 'find', (filter) => ({
      select: () => ({
        lean: () => Promise.resolve([{ _id: MINT, imageUrl: 'https://img.test/x.png' }]),
      }),
    }));
  });

  afterEach(() => {
    mock.restoreAll();
  });

  test('new tab tokens carry real volume (not hard 0)', async () => {
    const { statusCode, body } = await loadTab('new');
    assert.equal(statusCode, 200);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].mint, MINT);
    assert.equal(body.data[0].volume, 700.5);
  });

  test('new tab age is emitted in fractional minutes (seconds survive the pipeline)', async () => {
    const { body } = await loadTab('new');
    const age = body.data[0].ageMinutes;
    assert.ok(age > 0.3 && age < 0.7, `expected ~30s (0.5m), got ${age}m`);
    assert.notEqual(Math.round(age), 0, '0.5m must not round to 0 (the "0m" bug)');
  });

  test('migrated tab tokens carry real volume, holders and tx counts', async () => {
    const { body } = await loadTab('migrated');
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].volume, 700.5);
    assert.equal(body.data[0].holders, 2);
    assert.equal(body.data[0].transactions, 12);
  });

  test('migrated tab exposes a precise migratedMinutesAgo and original timestamp', async () => {
    const { body } = await loadTab('migrated');
    const t = body.data[0];
    assert.equal(t.migratedAt, MIGRATION_TIME);
    assert.ok(t.migratedMinutesAgo > 0.5 && t.migratedMinutesAgo < 0.9, `expected ~40s, got ${t.migratedMinutesAgo}m`);
    assert.notEqual(Math.round(t.migratedMinutesAgo), 0, '40s must not round to 0');
  });
});