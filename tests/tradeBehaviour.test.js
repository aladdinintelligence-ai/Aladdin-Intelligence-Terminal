import test from 'node:test';
import assert from 'node:assert/strict';
import { annotateTradesWithBehaviour, behaviourForWallet, clusterSpanMs } from '../services/tradeBehaviourService.js';

const NOW = Date.now();
const T = (offsetSec) => new Date(NOW + offsetSec * 1000).toISOString();

test('clusterSpanMs finds the tightest window of three same-sized buys', () => {
  assert.equal(clusterSpanMs([0, 30 * 1000, 45 * 1000], [1000, 1000, 1000]), 45 * 1000);
  assert.equal(clusterSpanMs([0, 30 * 1000, 900 * 1000], [1000, 1000, 1010]), 900 * 1000);
  assert.equal(clusterSpanMs([0, 30 * 1000, 45 * 1000], [1000, 1000, 2500]), Infinity);
  assert.equal(clusterSpanMs([0, 30 * 1000], [1000, 1000]), Infinity);
  assert.equal(clusterSpanMs([], []), Infinity);
});

test('the wallet behind every transaction of the same trader carries the same behaviour label', () => {
  const trades = [
    { time: T(0), side: 'BUY', amount: 1000, priceUsd: 0.1, wallet: 'AAA', signature: 'a1' },
    { time: T(10), side: 'BUY', amount: 1000, priceUsd: 0.12, wallet: 'AAA', signature: 'a2' },
    { time: T(20), side: 'SELL', amount: 1000, priceUsd: 0.14, wallet: 'AAA', signature: 'a3' },
    { time: T(21), side: 'SELL', amount: 1000, priceUsd: 0.15, wallet: 'AAA', signature: 'a4' },
  ];
  const out = annotateTradesWithBehaviour(trades, null);
  for (const t of out) assert.equal(t.behaviour, 'Scalper');
});

test('creator wallet is labelled Creator even when it also scalps', () => {
  const group = { wallet: 'CRE', buys: 3, sells: 3, usdIn: 999, firstT: NOW, lastT: NOW + 20 * 1000, buyTimesMs: [NOW], buyAmounts: [100, 110, 105] };
  assert.equal(behaviourForWallet(group, 'CRE', NOW), 'Creator');
});

test('near-identical buys inside a tight window flag a Cluster Wallet', () => {
  const buys = [1000, 1000, 1000];
  const at = [NOW, NOW + 5000, NOW + 9000];
  const group = { wallet: 'CLU', buys: 3, sells: 0, usdIn: 300, firstT: NOW, lastT: NOW + 9000, buyTimesMs: at, buyAmounts: buys };
  assert.equal(behaviourForWallet(group, null, NOW), 'Cluster Wallet');
});

test('rides are flagged as a scalper, holding sweeps as a bundle specialist', () => {
  const scalper = { wallet: 'SCA', buys: 2, sells: 2, usdIn: 200, firstT: NOW, lastT: NOW + 60 * 1000, buyTimesMs: [NOW, NOW + 30 * 1000], buyAmounts: [100, 110] };
  assert.equal(behaviourForWallet(scalper, null, NOW), 'Scalper');

  const bundle = { wallet: 'BND', buys: 3, sells: 0, usdIn: 300, firstT: NOW, lastT: NOW + 300, buyTimesMs: [NOW, NOW + 100, NOW + 300], buyAmounts: [500, 900, 1700] };
  assert.equal(behaviourForWallet(bundle, null, NOW), 'Bundle Specialist');
});

test('single tiny first-touch is a Fresh Wallet', () => {
  const fresh = { wallet: 'NEW', buys: 1, sells: 0, usdIn: 20, firstT: NOW + 600 * 1000, lastT: NOW + 600 * 1000, buyTimesMs: [NOW + 600 * 1000], buyAmounts: [200] };
  assert.equal(behaviourForWallet(fresh, null, NOW), 'Fresh Wallet');

  const bigSingle = { wallet: 'BIG', buys: 1, sells: 0, usdIn: 5000, firstT: NOW + 600 * 1000, lastT: NOW + 600 * 1000, buyTimesMs: [NOW + 600 * 1000], buyAmounts: [50000] };
  assert.equal(behaviourForWallet(bigSingle, null, NOW), 'Buyer');
});

test('early entry with distribution reads as Migration Specialist; late entries fall back to direction', () => {
  const early = { wallet: 'MS', buys: 2, sells: 1, usdIn: 150, firstT: NOW, lastT: NOW + 60 * 60 * 1000, buyTimesMs: [NOW, NOW + 1000], buyAmounts: [100, 120] };
  assert.equal(behaviourForWallet(early, null, NOW), 'Migration Specialist');

  const late = { wallet: 'LATE', buys: 2, sells: 1, usdIn: 150, firstT: NOW + 50 * 60 * 1000, lastT: NOW + 60 * 60 * 1000, buyTimesMs: [NOW + 50 * 60 * 1000, NOW + 51 * 60 * 1000], buyAmounts: [100, 120] };
  assert.equal(behaviourForWallet(late, null, NOW), 'Mixed');
});

test('one-sided wallets degrade to Buyer / Seller', () => {
  const buyer = { wallet: 'BYR', buys: 3, sells: 0, usdIn: 250, firstT: NOW, lastT: NOW + 20 * 1000, buyTimesMs: [NOW, NOW + 10 * 1000, NOW + 20 * 1000], buyAmounts: [500, 2000, 800] };
  assert.equal(behaviourForWallet(buyer, null, NOW), 'Buyer');

  const seller = { wallet: 'SLL', buys: 0, sells: 3, usdIn: 0, firstT: NOW, lastT: NOW + 1000, buyTimesMs: [], buyAmounts: [] };
  assert.equal(behaviourForWallet(seller, null, NOW), 'Seller');
});

test('annotate leaves rows with no wallet untouched and never mutates inputs', () => {
  const trades = [
    { time: T(0), side: 'BUY', amount: 1000, priceUsd: 0.1, wallet: '', signature: 'x1' },
    { time: T(1), side: 'BUY', amount: 1000, priceUsd: 0.1, wallet: 'ABC', signature: 'x2' },
  ];
  const before = JSON.stringify(trades);
  const out = annotateTradesWithBehaviour(trades, null);
  assert.equal(out[0].behaviour, undefined);
  assert.equal(out[1].behaviour, 'Fresh Wallet');
  assert.equal(JSON.stringify(trades), before);
});