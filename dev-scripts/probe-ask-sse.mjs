import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { User } from '../models/user.model.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || 'aladdin-dev-jwt-secret-change-in-production';
const DB_URI = process.env.DB_URI || 'mongodb://localhost:27017/aladdin-db';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runDir = path.dirname(fileURLToPath(import.meta.url));

await mongoose.connect(DB_URI);
const devUser = await User.findOneAndUpdate(
  { 'authProviders.provider': 'phantom', 'authProviders.providerId': 'probe-dev-user' },
  {
    $setOnInsert: { displayName: 'Probe Dev' },
    $set: { primaryProfile: 'Trader', timezone: 'Europe/London' },
  },
  { upsert: true, returnDocument: 'after' },
);
const token = jwt.sign({ userId: devUser._id.toString() }, JWT_SECRET, { expiresIn: '1h' });
console.log('SEEDED USER', devUser._id.toString());

const server = spawn(process.execPath, ['server.js'], { cwd: path.join(runDir, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
server.stdout.on('data', (d) => (logs += d.toString()));
server.stderr.on('data', (d) => (logs += d.toString()));

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    if (/Aladdin Node Server/i.test(logs)) return true;
    if (/error|ECONNREFUSED/i.test(logs) && i > 15) return false;
  }
  return /Aladdin Node Server/i.test(logs);
}

let exitCode = 0;
try {
  const up = await waitForServer();
  if (!up) {
    console.log('SERVER LOGS:\n', logs.slice(0, 2000));
    throw new Error('Server did not boot cleanly');
  }
  console.log('SERVER BOOT OK');

  const res = await fetch('http://localhost:5000/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      question: 'Which wallets are holding a token?',
      mode: 'Trader',
      depth: 'deep',
      hasPriorContext: false,
    }),
  });
  console.log('ASK STATUS', res.status);
  const text = await res.text();
  const frames = text
    .split('\n\n')
    .map((raw) => raw.split('\n').find((l) => l.startsWith('data:')))
    .filter(Boolean)
    .map((l) => JSON.parse(l.slice(5).trim()));
  console.log('FRAME TYPES', frames.map((f) => f.type).join(', '));
  const complete = frames.find((f) => f.type === 'complete');
  if (!complete) {
    const err = frames.find((f) => f.type === 'error');
    console.log('NO COMPLETE FRAME. error:', JSON.stringify(err?.error ?? null));
    console.log('BODY HEAD', text.slice(0, 400));
    throw new Error('missing complete frame');
  }
  const a = complete.result.answer;
  console.log('HAS_DATA', a.has_data, '| rows', a.result_rows.length, '| avail', a.availability, '| synth', a.synthetic);
  console.log('COLUMNS', a.result_columns.map((c) => `${c.key}:${c.kind}`).join(', '));
  console.log('EVENTS', complete.result.activityEvents.length, '| first event', complete.result.activityEvents[0]?.message);
  console.log('DIRECT:', (a.direct_answer || '').slice(0, 160));

  const profileRes = await fetch('http://localhost:5000/api/ask/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const profileJson = await profileRes.json();
  console.log('PROFILE STATUS', profileRes.status, '| tz', profileJson.data?.timezone, '| profile', profileJson.data?.primaryProfile);
} catch (e) {
  console.error('TEST ERROR', e.message);
  exitCode = 1;
} finally {
  server.kill();
  await sleep(600);
  await mongoose.disconnect();
  process.exit(exitCode);
}