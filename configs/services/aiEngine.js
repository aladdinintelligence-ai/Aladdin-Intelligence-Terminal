import { readFileSync, existsSync } from 'fs';
import path from 'path';

import dotenv from 'dotenv';

dotenv.config();

const env = process.env;

const packageJsonPath = path.resolve(process.cwd(), 'package.json');
let appVersion = 'dev';
let appId = 'aladdin-node-server';

try {
  if (existsSync(packageJsonPath)) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    if (pkg.name) appId = pkg.name;
    if (pkg.version) appVersion = pkg.version;
  }
} catch {
  // Ignore unreadable package.json
}

const referralUrl = env.OPENROUTER_REFERRAL_URL || 'http://localhost:5000';
const siteUrl = env.OPENROUTER_SITE_URL || 'http://localhost:5000';

function requiredKey(name) {
  if (!env[name]) {
    throw new Error(`Missing required config [${name}]`);
  }
  return env[name];
}

function intValue(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const corsWhitelist = (env.CORS_WHITELIST || '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

const aiEngine = {
  openRouter: {
    apiKey: env.OPENROUTER_API_KEY || '',
    baseUrl: env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    models: {
      quick: env.OPENROUTER_MODEL_QUICK || 'openai/gpt-4o-mini',
      deep: env.OPENROUTER_MODEL_DEEP || 'anthropic/claude-sonnet-4-5',
      default: env.OPENROUTER_MODEL_DEFAULT || 'openai/gpt-4o-mini',
    },
    temperature: env.AI_TEMPERATURE != null ? parseFloat(env.AI_TEMPERATURE) : 0.2,
    maxTokensDefault: intValue(env.AI_MAX_TOKENS_DEFAULT, 1024),
    timeoutMs: intValue(env.AI_TIMEOUT_MS, 45000),
  },
  composer: {
    enabled: env.AI_COMPOSER_ENABLED !== 'false',
    workerMode: env.COMPOSER_WORKER_MODE === 'true',
  },
  verifier: {
    enabled: env.AI_VERIFIER_ENABLED !== 'false',
    strictNumbers: env.AI_VERIFIER_STRICT === 'true',
  },
  engine: {
    userAgent: `${appId}/${appVersion} (${siteUrl})`,
    requestTimeoutMs: intValue(env.AI_REQUEST_TIMEOUT_MS, 60000),
    queueEnabled: env.AI_QUEUE_ENABLED === 'true',
  },
};

export { aiEngine, requiredKey };