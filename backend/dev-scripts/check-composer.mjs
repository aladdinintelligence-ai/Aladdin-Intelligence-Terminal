import { initAiComposer, chatJson, keyProblem } from '../services/aiComposer.js';

initAiComposer({});
console.log('keyProblem:', keyProblem(process.env.OPENROUTER_API_KEY));

const r = await chatJson(
  [
    { role: 'system', content: 'Return JSON only.' },
    { role: 'user', content: 'Return {"profile_summary":"ok","direct_answer":"hi","follow_ups":[]}' },
  ],
  { tier: 'quick', maxTokens: 200 },
);
console.log('ok:', r.ok);
console.log('model:', r.model);
console.log('content:', JSON.stringify(r.content));
if (r.error) console.log('error:', r.error);
