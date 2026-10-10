import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { groupPairsByMint } from '../providers/dataLayer.js';

// Regression: requestDexChunk grouped every pair of the batch under every
// mint (`mints.includes(baseToken.address)`), so dexBatch returned the same
// first pair for all mints — /movers then rendered a single token name for
// every row.

describe('groupPairsByMint', () => {
  const A = 'mintAaaa';
  const B = 'mintBbbb';
  const pairA = { pairAddress: 'pairA', baseToken: { address: A, name: 'Alpha', symbol: 'ALP' } };
  const pairA2 = { pairAddress: 'pairA2', baseToken: { address: A, name: 'Alpha', symbol: 'ALP' } };
  const pairB = { pairAddress: 'pairB', baseToken: { address: B, name: 'Beta', symbol: 'BET' } };
  const pairX = { pairAddress: 'pairX', baseToken: { address: 'unrequested', name: 'X', symbol: 'X' } };
  const noAddress = { baseToken: { address: A, name: 'Alpha', symbol: 'ALP' } };

  test('each mint gets only its own pairs, in response order', () => {
    const map = groupPairsByMint([A, B], [pairA, pairB, pairA2]);
    assert.deepEqual(map[A], [pairA, pairA2]);
    assert.deepEqual(map[B], [pairB]);
  });

  test('the first pair for every mint belongs to that mint (the reported bug)', () => {
    const map = groupPairsByMint([A, B], [pairA, pairB]);
    assert.equal(map[A][0].baseToken.address, A);
    assert.equal(map[B][0].baseToken.address, B);
    assert.equal(map[B][0].baseToken.name, 'Beta');
  });

  test('excludes pairs of unrequested tokens and pairs without pairAddress', () => {
    const map = groupPairsByMint([A], [pairA, pairX, noAddress]);
    assert.deepEqual(map[A], [pairA]);
  });

  test('mints with no matching pairs map to an empty list', () => {
    const map = groupPairsByMint([A, B], [pairA]);
    assert.deepEqual(map[B], []);
  });

  test('tolerates a missing/invalid pairs payload', () => {
    assert.deepEqual(groupPairsByMint([A], undefined), { [A]: [] });
    assert.deepEqual(groupPairsByMint([A], null), { [A]: [] });
  });
});
