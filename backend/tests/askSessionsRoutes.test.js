import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('ask session persistence wiring', () => {
  test('ask analysis is public while session history routes stay behind auth', () => {
    const routes = read('routes/ask.js');
    assert.match(routes, /import \{ optionalAuth, requireAuth \} from '\.\.\/middleware\/auth\.js'/);
    assert.match(routes, /askRouter\.post\('\/api\/ask', optionalAuth, applyProfile, askLimiter, askAladdinController\)/);
    assert.match(routes, /askRouter\.get\('\/api\/ask\/sessions', requireAuth/);
    assert.match(routes, /askRouter\.post\('\/api\/ask\/sessions', requireAuth/);
    assert.match(routes, /askRouter\.delete\('\/api\/ask\/sessions\/:id', requireAuth/);
    assert.match(routes, /askRouter\.post\('\/api\/ask\/sessions\/:id\/duplicate', requireAuth/);
  });

  test('anonymous ask runs never write conversation history', () => {
    const controller = read('controllers/ask/askAladdinController.js');
    assert.match(controller, /const userId = req\.user\?\.userId \|\| null/);
    assert.match(controller, /const runDoc = userId/);
    assert.match(controller, /if \(runDoc\)/);
  });

  test('the SSE controller tracks response close, so the final frame still flushes', () => {
    const controller = read('controllers/ask/askAladdinController.js');
    // On a POST the request stream closes as soon as the body is parsed; using
    // req 'close' would set `closed` early and suppress the complete frame.
    assert.match(controller, /res\.on\('close', onClose\)/);
    assert.doesNotMatch(controller, /req\.on\('close', onClose\)/);
    assert.match(controller, /if \(res\.writableEnded\) return/);
  });

  test('session service caps stored history per account', () => {
    const service = read('services/askSessions.js');
    assert.match(service, /const MAX_SESSIONS = 12/);
    assert.match(service, /doc\.sessions\.slice\(0, MAX_SESSIONS\)/);
  });
});
