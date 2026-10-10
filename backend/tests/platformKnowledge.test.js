import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PLATFORM,
  PAGES,
  detectPlatformIntent,
  selectPages,
  sanitizePageIds,
  toPageActions,
  platformFallbackAnswer,
  buildPlatformSystemPrompt,
  PLATFORM_PAGE_IDS,
} from '../services/platformKnowledge.js';

test('platform intent is detected for product, navigation and concept questions', () => {
  for (const question of [
    'What is Aladdin?',
    'who are you',
    'what can you do',
    'help',
    'where do I find new launches?',
    'how do I use the watchlist',
    'what is a migration specialist',
    'explain the answer modes',
    'take me to smart money',
  ]) {
    assert.equal(detectPlatformIntent(question).matched, true, `expected platform intent for: ${question}`);
  }
});

test('platform intent does not hijack data questions', () => {
  for (const question of [
    'which tokens are launching right now?',
    'show me the top profitable wallets today',
    'compare first-100 retention across today\'s migrated tokens',
    '7E4mMMVB3Vv2pL8c1bq9mJd6XzqYq3Zq9Yq3Zq9Yq3Z',
    'who are the migration specialists in BARK?',
  ]) {
    assert.equal(detectPlatformIntent(question).matched, false, `must stay a data question: ${question}`);
  }
});

test('every page id is unique, every static route is linkable, and key surfaces exist', () => {
  const ids = PAGES.map((page) => page.id);
  assert.equal(new Set(ids).size, ids.length, 'page ids must be unique');
  for (const page of PAGES) {
    if (page.dynamic) continue;
    assert.match(page.route, /^\//, `${page.id} route must be absolute`);
  }
  const routes = new Set(PAGES.map((page) => page.route));
  for (const route of ['/', '/launches', '/movers', '/smart-money', '/formation', '/insiders', '/clusters', '/historical', '/watchlist', '/alerts', '/ask-aladdin', '/queries', '/dashboards', '/settings']) {
    assert.ok(routes.has(route), `missing real route: ${route}`);
  }
});

test('the guide prompt embeds the overview, the page catalog and the JSON contract', () => {
  const prompt = buildPlatformSystemPrompt();
  assert.match(prompt, /Aladdin Intelligence/);
  assert.match(prompt, /PAGES \(use ONLY these/);
  for (const route of ['/launches', '/smart-money', '/ask-aladdin', '/watchlist', '/settings']) {
    assert.ok(prompt.includes(route), `prompt must describe ${route}`);
  }
  assert.match(prompt, /Return JSON only/);
  assert.match(prompt, /"answer": string/);
  assert.deepEqual(PLATFORM_PAGE_IDS, PAGES.map((page) => page.id));
});

test('page selection maps concepts to real surfaces', () => {
  assert.ok(selectPages('where can I see new token launches').includes('launches'));
  assert.ok(selectPages('where is the smart money list').includes('smart-money'));
  assert.ok(selectPages('how do I check my watchlist').includes('watchlist'));
});

test('model-provided pages are validated against the catalog', () => {
  assert.deepEqual(sanitizePageIds(['launches', 'not-a-page', 'launches', 'alerts', 'extra', 'insiders']), ['launches', 'alerts', 'insiders']);
  assert.deepEqual(sanitizePageIds('launches'), []);
});

test('page actions only link static routes and never dynamic ones', () => {
  const actions = toPageActions(['terminal', 'launches', 'wallet', 'smart-money']);
  assert.deepEqual(actions.map((action) => action.route), ['/launches', '/smart-money']);
  assert.deepEqual(actions.map((action) => action.label), ['Open Launches', 'Open Smart / Profitable Money']);
});

test('the deterministic fallback names a real page and never fabricates', () => {
  const answer = platformFallbackAnswer('where can I see new token launches', ['launches']);
  assert.match(answer, /Aladdin Intelligence/);
  assert.match(answer, /Launches \(\/launches\)/);
});

test('the answer engine routes a platform intent to the guide without treating it as data', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'services/aiEngine.js'), 'utf8');
  assert.match(source, /from '\.\/platformKnowledge\.js'/);
  assert.match(source, /detectPlatformIntent\(question\)/);
  assert.match(source, /intent: 'platform'/);
  assert.match(source, /composePlatformNarrative/);
});
