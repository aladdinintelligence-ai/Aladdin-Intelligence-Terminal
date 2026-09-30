import { initAiComposer } from '../services/aiComposer.js';
import { runAskAladdin } from '../services/aiEngine.js';

// Offline mock: unreachable baseUrl + sentinel key forces the deterministic path
// without ever calling OpenRouter.
initAiComposer({ baseUrl: 'http://localhost:9999', apiKey: 'sk-or-v1-offline-smoke-test', timeoutMs: 2000 });

const period = {
  start: '2026-09-29T00:00:00.000Z', end: '2026-09-29T12:00:00.000Z',
  timezone: 'Europe/London', label: '29 September 2026, 00:00 to 12:00 Europe/London',
  resolution: 'today',
};

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
  console.log(`  ok: ${msg}`);
}

async function run(question, opts = {}) {
  console.log(`\n=== ${question} (mode=${opts.mode || 'Trader'}, depth=${opts.depth || 'quick'}) ===`);
  const events = [];
  const result = await runAskAladdin(
    { question, mode: opts.mode || 'Trader', period, depth: opts.depth || 'quick', hasPriorContext: opts.hasPriorContext, currentEntityId: opts.currentEntityId },
    { onActivity: (evs) => events.push(evs), pauseMs: 5 }
  );
  const a = result.answer;
  assert(a, 'answer present');
  assert(typeof a.direct_answer === 'string' && a.direct_answer.length > 0, 'direct_answer string');
  assert(Array.isArray(a.result_columns), 'result_columns array');
  assert(Array.isArray(a.result_rows), 'result_rows array');
  assert(typeof a.result_count === 'number', 'result_count number');
  assert(Array.isArray(a.generated_follow_ups), 'generated_follow_ups array');
  assert(a.analysis_period === period, 'analysis_period echoes request');
  assert(Array.isArray(result.activityEvents), 'activityEvents array');
  assert(events.length > 0 && result.activityEvents.length > 0, 'activity callback fired');
  if (a.has_data !== false) {
    const last = events[events.length - 1] || [];
    assert(last.length === result.activityEvents.length, 'final activity matches result events');
    const kinds = new Set(a.result_columns.map((c) => c.kind));
    for (const k of kinds) {
      assert(['text', 'number', 'usd', 'money', 'percent', 'token', 'side', 'wallet', 'tokenLink', 'contract'].includes(k), `column kind valid: ${k}`);
    }
    if (a.result_rows.length) {
      assert(a.availability === 'available', 'availability available when rows exist');
      assert(a.synthetic === false, 'synthetic false for real-data path');
      assert(a.data_details.evidenceHash.length > 0, 'evidence hash present');
    }
  }
  return result;
}

await run('Hi', { mode: 'Trader' });
await run('What can you do?');
await run('What is a Migration Specialist?');
await run('Buy this now', { mode: 'Trader' });
await run('Which tokens are trending?', { depth: 'deep' });
await run('Show the top movers today', { mode: 'Analyst', depth: 'deep' });
await run('Which wallets are holding a token?', { mode: 'Trader', depth: 'deep' });
await run('Compare two tokens', { mode: 'Analyst', depth: 'deep' });
await run('anything else', { hasPriorContext: true });

console.log('\nALL TESTS PASSED');