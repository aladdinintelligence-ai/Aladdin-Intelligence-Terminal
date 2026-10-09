import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { internals } from '../controllers/search/searchController.js';

const { validMint, normalizePair, dedupeByMint } = internals;

const pair = (overrides = {}) => ({
  chainId: 'solana',
  dexId: 'raydium',
  pairAddress: 'PairAddress1234567890123456789012345678A',
  baseToken: { address: 'SoBpBaseTokenMintAddrxxxxxxxxxxxxxxxxxxxxxxx', name: 'Alpha Pump', symbol: 'ALPHA' },
  quoteToken: { address: 'So11111111111111111111111111111111111111112', name: 'Wrapped SOL', symbol: 'SOL' },
  priceUsd: '0.001',
  priceChange: { h24: '12.5' },
  volume: { h24: '3200.5' },
  liquidity: { usd: '4100' },
  marketCap: '82000',
  fdv: '84000',
  pairCreatedAt: 1740000000,
  info: { imageUrl: 'https://cdn.example.com/a.png' },
  url: 'https://dexscreener.com/solana/pair',
  ...overrides,
});

describe('search controller internals', () => {
  test('validMint accepts base58 solana addresses and rejects junk', () => {
    assert.equal(validMint('SoBpBaseTokenMintAddrxxxxxxxxxxxxxxxxxxxxxxx'), true);
    assert.equal(validMint('notaurl'), false);
    assert.equal(validMint('0x' + 'a'.repeat(40)), false);
    assert.equal(validMint(null), false);
    assert.equal(validMint(undefined), false);
  });

  test('normalizePair keeps the tokenInfo shape for a solana pair', () => {
    const out = normalizePair(pair());
    assert.equal(out.mint, 'SoBpBaseTokenMintAddrxxxxxxxxxxxxxxxxxxxxxxx');
    assert.equal(out.symbol, 'ALPHA');
    assert.equal(out.name, 'Alpha Pump');
    assert.equal(out.priceUsd, 0.001);
    assert.equal(out.priceChange24h, 12.5);
    assert.equal(out.volume24h, 3200.5);
    assert.equal(out.liquidityUsd, 4100);
    assert.equal(out.marketCapUsd, 82000);
    assert.equal(out.fdvUsd, 84000);
    assert.equal(out.pairCreatedAt, 1740000000);
    assert.equal(out.imageUrl, 'https://cdn.example.com/a.png');
  });

  test('normalizePair rejects non-solana chains, missing base token, or short mints', () => {
    assert.equal(normalizePair(pair({ chainId: 'ethereum' })), null);
    assert.equal(normalizePair(pair({ baseToken: null })), null);
    assert.equal(normalizePair(pair({ baseToken: { address: 'abc', name: 'X', symbol: 'X' } })), null);
    assert.equal(normalizePair(pair({ baseToken: { address: 'SoBpBaseTokenMintAddrxxxxxxxxxxxxxxxxxxxxxxx', name: '', symbol: 'X' } })), null);
  });

  test('marketCap falls back to fdv when market cap is missing', () => {
    const out = normalizePair(pair({ marketCap: null }));
    assert.equal(out.marketCapUsd, 84000);
  });

  test('dedupeByMint keeps one pair per mint and prefers the highest-liquidity pair', () => {
    const a = normalizePair(pair({ pairAddress: 'PAIR_A', liquidity: { usd: '100' } }));
    const b = normalizePair(pair({ pairAddress: 'PAIR_B', liquidity: { usd: '900' } }));

    const out = dedupeByMint([a, b]);
    const list = [...out.values()];
    assert.equal(list.length, 1);
    assert.equal(list[0].pairAddress, 'PAIR_B');
  });

  test('dedupeByMint keeps distinct mints in first-seen order', () => {
    const first = normalizePair(pair());
    const second = normalizePair(pair({ baseToken: { address: 'SecondMintAddrxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', name: 'Beta Token', symbol: 'BETA' } }));
    const out = dedupeByMint([first, second]);
    const list = [...out.values()];
    assert.equal(list.length, 2);
    assert.equal(list[0].mint, 'SoBpBaseTokenMintAddrxxxxxxxxxxxxxxxxxxxxxxx');
    assert.equal(list[1].mint, 'SecondMintAddrxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  });
});