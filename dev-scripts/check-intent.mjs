import { resolveAskIntent } from '../services/aiEngine.js';

const period = { start: '', end: '', timezone: 'Europe/London', label: '', resolution: 'today' };
const cases = [
  ['good day', false],
  ['good morning', false],
  ['hello', false],
  ['why', true],
  ['why is that?', true],
  ['get me best trading tokens', true],
  ['analyze any token of your choice', true],
  ['show me the top movers', true],
  ['what is a migration specialist?', false],
  ['buy this now', false],
  ['thanks', false],
];

let failed = 0;
for (const [question, prior] of cases) {
  const r = resolveAskIntent({ question, mode: 'Trader', period, hasPriorContext: prior });
  console.log(`${r.intent.padEnd(12)} | ${question}`);
  if (r.intent === 'ambiguous') failed++;
}
console.log(failed === 0 ? '\nNO AMBIGUOUS LEAKS' : `\n${failed} STILL AMBIGUOUS`);
