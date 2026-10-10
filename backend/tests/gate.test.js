import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createGate } from '../providers/gate.js';

// Verifies the concurrency gate reserves at least one slot for user-triggered
// requests even when background work is congested, and caps background work at
// backgroundConcurrent.
describe('concurrency gate reservation', () => {
  function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  const CONCURRENT = 2;
  const BG_MAX = 1; // keep 1 slot reserved for user traffic

test('background work caps at backgroundConcurrent, user request still gets a slot', async () => {
    const d = deferred();
    const gate = createGate({
      maxConcurrent: CONCURRENT,
      backgroundConcurrent: BG_MAX,
      transport: () => d.promise,
    });

    // First background task occupies the single background slot.
    // Second background task must NOT run concurrently with the first.
    const started = await new Promise((resolve) => {
      gate.gated('query-bg-1', 'bg1', { priority: 'background' });
      gate.gated('query-bg-2', 'bg2', { priority: 'background' });
      // Give the gate a tick to pump
      setImmediate(() => resolve([gate.state().active, gate.state().activeBackground, gate.state().queued]));
    });
    assert.deepEqual(started, [1, 1, 1], 'only one background task runs, second is queued');

    // A user request still runs even though the background slot is full.
    const afterUser = await new Promise((resolve) => {
      gate.gated('query-user', 'user');
      setImmediate(() => resolve(gate.state().active));
    });
    assert.equal(afterUser, 2, 'user request occupies the free (reserved) slot');
  });
});