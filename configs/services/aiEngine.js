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
  // OpenAI-compatible LLM provider. Defaults to OpenCode Go (oc_sk_... key),
  // but also accepts OpenRouter (sk-or-... key) via the OPENROUTER_* env vars.
  openRouter: {
    apiKey: env.OPENCODE_API_KEY || env.OPENROUTER_API_KEY || '',
    baseUrl: env.OPENCODE_BASE_URL || env.OPENROUTER_BASE_URL || 'https://opencode.ai/zen/go/v1',
    models: {
      quick: env.OPENCODE_MODEL_QUICK || env.OPENROUTER_MODEL_QUICK || 'glm-5.3-flash',
      deep: env.OPENCODE_MODEL_DEEP || env.OPENROUTER_MODEL_DEEP || 'glm-5.3',
      default: env.OPENCODE_MODEL_DEFAULT || env.OPENROUTER_MODEL_DEFAULT || 'glm-5.3-flash',
    },
    sessionId: env.OPENCODE_SESSION || '',
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