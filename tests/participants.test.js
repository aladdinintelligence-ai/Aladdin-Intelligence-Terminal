import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTICIPANT_BEHAVIOUR_ORDER,
  annotateWallets,
  classifyParticipant,
  groupParticipants,
} from '../services/participantBehaviourService.js';

const NOW = Date.now();
const MIN = 60 * 1000;

function md(ms) {
  return new Date(NOW + ms).toISOString();
}

function wallet(overrides = {}) {
  return {
    wallet: '7xK11111111111111111111111111132a',
    trades: 0,
    buys: 0,
    sells: 0,
    buyTimesMs: [],
    sellTimesMs: [],
    ...overrides,
  };
}

test('a wallet with fewer than 2 trades is a Fresh Wallet', () => {
  const w = wallet({ buys: 1, sells: 0, trades: 1, buyTimesMs: [NOW] });
  assert.equal(classifyParticipant(w, null), 'Fresh Wallet');
});

test('a 20+ trade wallet that only buys has no dominant pattern -> Unknown Wallet', () => {
  const w = wallet({ buys: 25, sells: 0, trades: 25, buyTimesMs: Array.from({ length: 25 }, () => NOW) });
  assert.equal(classifyParticipant(w, null), 'Unknown Wallet');
});

test('a 20+ trade wallet buying early and selling late is a Migration Specialist', () => {
  const w = wallet({
    buys: 12,
    sells: 10,
    trades: 22,
    buyTimesMs: Array.from({ length: 12 }, () => NOW - 6 * 60 * MIN),
    sellTimesMs: Array.from({ length: 10 }, () => NOW - MIN),
  });
  assert.equal(classifyParticipant(w, null), 'Migration Specialist');
});

test('a 20+ trade wallet churning within short holding periods is a Scalper', () => {
  const buyTimes = Array.from({ length: 11 }, (_, i) => NOW - i * 2 * MIN);
  const sellTimes = Array.from({ length: 11 }, (_, i) => NOW - i * 2 * MIN + 2 * MIN);
  const w = wallet({ buys: 11, sells: 11, trades: 22, buyTimesMs: buyTimes, sellTimesMs: sellTimes });
  assert.equal(classifyParticipant(w, null), 'Scalper');
});

test('the creator of the token is always a Creator Wallet', () => {
  const creatorAddress = '8Gcj1H2j3k4l5m6n7o8p9q0r1s2t3u4v5w6x7y8z9a';
  const w = wallet({ wallet: creatorAddress, buys: 3, trades: 3 });
  assert.equal(classifyParticipant(w, creatorAddress), 'Creator Wallet');
});

test('creator status is token-specific: the same address is Fresh on another token', () => {
  const creatorAddress = '8Gcj1H2j3k4l5m6n7o8p9q0r1s2t3u4v5w6x7y8z9a';
  const w = wallet({ wallet: creatorAddress, buys: 1, trades: 1 });
  assert.equal(classifyParticipant(w, null), 'Fresh Wallet');
});

test('annotateWallets attaches a behaviour label to every wallet row', () => {
  const rows = [
    wallet({ wallet: 'a1', buys: 1, sells: 0, trades: 1 }),
    wallet({ buys: 25, sells: 0, trades: 25 }),
  ];
  const labelled = annotateWallets(rows, null);
  assert.equal(labelled[0].behaviour, 'Fresh Wallet');
  assert.equal(labelled[1].behaviour, 'Unknown Wallet');
});

test('groupParticipants buckets wallets and sums buys/sells per behaviour', () => {
  const rows = [
    wallet({ wallet: 'a1', buys: 1, sells: 0, trades: 1 }),
    wallet({ wallet: 'a2', buys: 1, sells: 0, trades: 1 }),
    wallet({ wallet: 'a3', buys: 1, sells: 0, trades: 1 }),
    wallet({ buys: 11, sells: 11, trades: 22, buyTimesMs: [1], sellTimesMs: [120 * MIN] }),
  ];
  const groups = groupParticipants(rows, null);
  assert.ok(groups.every((g) => PARTICIPANT_BEHAVIOUR_ORDER.includes(g.behaviour)));
  const fresh = groups.find((g) => g.behaviour === 'Fresh Wallet');
  assert.deepEqual(fresh, { behaviour: 'Fresh Wallet', wallets: 3, buys: 3, sells: 0 });
  const mig = groups.find((g) => g.behaviour === 'Migration Specialist');
  assert.deepEqual(mig, { behaviour: 'Migration Specialist', wallets: 1, buys: 11, sells: 11 });
});

test('groupParticipants always returns every behaviour label, even empty ones', () => {
  assert.deepEqual(groupParticipants([], null), PARTICIPANT_BEHAVIOUR_ORDER.map((behaviour) => ({ behaviour, wallets: 0, buys: 0, sells: 0 })));
});

test('a 20+ trade wallet with buys then sells after a long gap is not mislabelled as Scalper', () => {
  const buys = Array.from({ length: 11 }, (_, i) => NOW - 3 * 60 * MIN - i * MIN);
  const sells = Array.from({ length: 11 }, (_, i) => NOW - MIN + i * MIN);
  const w = wallet({ buys: 11, sells: 11, trades: 22, buyTimesMs: buys, sellTimesMs: sells });
  assert.equal(classifyParticipant(w, null), 'Migration Specialist');
});