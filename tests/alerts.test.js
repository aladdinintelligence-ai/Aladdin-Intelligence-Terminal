import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveAlertEvents } from '../controllers/alerts/alertsController.js';

const NOW = Date.now();
const T = (offsetMs) => NOW + offsetMs;

const MINT = 'HcH5av2dLQgbizJUB36VSHxmUcTmBr2pVvkmakrmpump';
function candidate(overrides = {}) {
  return {
    mint: MINT,
    name: 'Test Token',
    symbol: 'TEST',
    ageHours: 100,
    market: {
      marketCapUsd: 1_000_000,
      liquidityUsd: 50_000,
      volume24h: 40_000,
      change24h: 10,
      change1h: 3,
      migration: 12,
      imageUrl: null,
    },
    ...overrides,
  };
}

function trade(wallet, side, usd, timeMs = NOW) {
  return { wallet, side, usd, timeMs };
}

const byMint = (rows) => new Map([[MINT, rows]]);
const eventsOf = (alerts, type) => alerts.filter((a) => a.type === type);

test('a single wallet committing large capital fires a proven-entry high-signal alert', () => {
  const market = { ...candidate().market, volume24h: 20_000, change24h: 0 };
  const rows = [
    trade('7xK11111111111111111111111111132a', 'BUY', 5_200, T(-60_000)),
    trade('7xK11111111111111111111111111132a', 'SELL', 100, T(-59_000)),
  ];
  const { alerts } = deriveAlertEvents([{ ...candidate({ market }) }], byMint(rows), new Map());
  const list = eventsOf(alerts, 'proven_entry');
  assert.equal(list.length, 1);
  assert.equal(list[0].severity, 'high');
  assert.equal(list[0].signal, true);
  assert.equal(list[0].isNew, true);
  assert.equal(list[0].usd, 5_200);
  assert.deepEqual(list[0].wallets, ['7xK1…132a']);
});

test('large net sells by one wallet read as early holder distribution', () => {
  const rows = [
    trade('BM9C11111111111111111111111111jvMN', 'BUY', 300, T(-30_000)),
    trade('BM9C11111111111111111111111111jvMN', 'SELL', 2_100, T(-10_000)),
  ];
  const { alerts } = deriveAlertEvents([candidate()], byMint(rows), new Map());
  const list = eventsOf(alerts, 'distribution');
  assert.equal(list.length, 1);
  assert.equal(list[0].severity, 'high');
  assert.equal(list[0].usd, 2_100);
});

test('matured AMM volume on a young token fires the migration alert', () => {
  const market = { ...candidate().market, migration: 95 };
  const { alerts } = deriveAlertEvents([candidate({ market, ageHours: 120 })], byMint([]), new Map());
  assert.equal(eventsOf(alerts, 'migration').length, 1);
});

test('momentum needs a real 24h gain on meaningful volume', () => {
  const hot = { ...candidate().market, change24h: 55, volume24h: 120_000 };
  const { alerts } = deriveAlertEvents([candidate({ market: hot })], byMint([]), new Map());
  assert.equal(eventsOf(alerts, 'momentum').length, 1);

  const flat = { ...candidate().market, change24h: 15, volume24h: 400_000 };
  const none = deriveAlertEvents([candidate({ market: flat })], byMint([]), new Map());
  assert.equal(eventsOf(none.alerts, 'momentum').length, 0);
});

test('tiny fresh listings surface a launch alert', () => {
  const market = { ...candidate().market, marketCapUsd: 90_000, volume24h: 5_000, change24h: 0, migration: 0 };
  const { alerts } = deriveAlertEvents([candidate({ market, ageHours: 0.3 })], byMint([]), new Map());
  assert.equal(eventsOf(alerts, 'launch').length, 1);
});

test('three wallets buying inside a tight window read as cluster activity (medium)', () => {
  const rows = [
    trade('AA', 'BUY', 300, T(0)),
    trade('BB', 'BUY', 450, T(20_000)),
    trade('CC', 'BUY', 200, T(50_000)),
  ];
  const { alerts } = deriveAlertEvents([candidate()], byMint(rows), new Map());
  const list = eventsOf(alerts, 'cluster');
  assert.equal(list.length, 1);
  assert.equal(list[0].severity, 'medium');
  assert.equal(list[0].signal, false);
});

test('rotation fires only when the net direction flips versus the previous build', () => {
  const prev = new Map([[MINT, { direction: 'acc', keys: new Set() }]]);
  const rows = [
    trade('AA', 'BUY', 80, T(-3_000)),
    trade('AA', 'SELL', 400, T(-1_000)),
  ];
  const { alerts, signals } = deriveAlertEvents([candidate()], byMint(rows), prev);
  const list = eventsOf(alerts, 'rotation');
  assert.equal(list.length, 1);
  assert.equal(list[0].isChanged, true);
  assert.equal(signals.get(MINT).direction, 'dist');

  const steady = deriveAlertEvents([candidate()], byMint(rows), signals);
  assert.equal(eventsOf(steady.alerts, 'rotation').length, 0);
});

test('an alert already seen last build is not changed; a new type is', () => {
  const prev = new Map([[MINT, { direction: 'acc', keys: new Set(['distribution']) }]]);
  const market = { ...candidate().market, volume24h: 40_000, change24h: 15 };
  const rows = [
    trade('AA', 'BUY', 400, T(0)),
    trade('BB', 'BUY', 450, T(20_000)),
    trade('CC', 'BUY', 300, T(40_000)),
    trade('DD', 'SELL', 950, T(5_000)),
  ];
  const { alerts } = deriveAlertEvents([candidate({ market })], byMint(rows), prev);
  const distribution = eventsOf(alerts, 'distribution')[0];
  assert.equal(distribution.isChanged, false);
  const cluster = eventsOf(alerts, 'cluster')[0];
  assert.equal(cluster.isChanged, true);
});

test('alerts sort high-signal first, then newest', () => {
  const stip = {
    ...candidate().market,
    marketCapUsd: 90_000,
    volume24h: 60_000,
    change24h: 0,
    migration: 0,
  };
  const rows = [
    trade('AA', 'BUY', 250, T(0)),
    trade('BB', 'BUY', 240, T(20_000)),
    trade('CC', 'BUY', 260, T(40_000)),
  ];
  const { alerts } = deriveAlertEvents([candidate({ ageHours: 0.2, market: stip })], byMint(rows), new Map());
  assert.ok(alerts.length >= 2);
  const firstHigh = alerts.findIndex((a) => a.signal);
  const firstLow = alerts.findIndex((a) => !a.signal);
  assert.ok(firstHigh !== -1);
  assert.ok(firstLow > firstHigh);
});

test('every alert carries its market metrics for the frontend', () => {
  const market = { ...candidate().market, marketCapUsd: 120_000, volume24h: 8_000, migration: 0, change24h: 0 };
  const { alerts } = deriveAlertEvents([candidate({ market, ageHours: 0.4 })], byMint([]), new Map());
  assert.ok(alerts.length >= 1);
  for (const a of alerts) {
    assert.equal(typeof a.market, 'object');
    assert.ok(a.market !== null);
    assert.ok(Object.hasOwn(a.market, 'imageUrl'));
    assert.ok(Object.hasOwn(a.market, 'marketCapUsd'));
  }
});

test('quiet markets with no trade legs produce no alerts', () => {
  const quiet = { ...candidate().market, migration: 0, change24h: 0, volume24h: 1_000 };
  const { alerts } = deriveAlertEvents([candidate({ market: quiet })], byMint([]), new Map());
  assert.equal(alerts.length, 0);
});