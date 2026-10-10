import test from 'node:test';
import assert from 'node:assert/strict';

import { keyProblem, initAiComposer, resolveModel } from '../services/aiComposer.js';

test('keyProblem accepts OpenCode Go service-account keys', () => {
  assert.equal(keyProblem('oc_sk_186b534026d5_4HVETkww1x9IXQ_8Uk5v6DS83y1u0yFS'), null);
});

test('keyProblem accepts OpenRouter keys', () => {
  assert.equal(keyProblem('sk-or-v1-abcdef0123456789'), null);
});

test('keyProblem rejects an empty key', () => {
  const problem = keyProblem('');
  assert.ok(problem);
  assert.match(problem, /no llm api key/i);
});

test('keyProblem rejects an unrecognised key format', () => {
  const problem = keyProblem('random-token-value');
  assert.ok(problem);
  assert.match(problem, /unexpected format/i);
});

test('resolveModel maps tiers to configured model ids', () => {
  assert.equal(resolveModel('quick'), 'glm-5.3-flash');
  assert.equal(resolveModel('deep'), 'glm-5.3');
  assert.equal(resolveModel('default'), 'glm-5.3-flash');
});

test('initAiComposer marks an OpenCode Go configuration ready', () => {
  initAiComposer({
    baseUrl: 'https://opencode.ai/zen/go/v1',
    apiKey: 'oc_sk_test_key_1234567890',
    timeoutMs: 1000,
    userAgent: 'aladdin-node-server/test',
  });
  assert.doesNotThrow(() => resolveModel('default'));
});
