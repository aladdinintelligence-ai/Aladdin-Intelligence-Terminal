import axios from 'axios';
import { randomUUID } from 'crypto';

import { aiEngine } from '../configs/services/aiEngine.js';

let _baseUrl = '';
let _apiKey = '';
let _timeout = 45000;
let _userAgent = '';
let _isOpenCode = false;
let _isOpenRouter = false;
let _sessionId = '';

const KNOWN_KEY_PREFIXES = ['oc_sk_', 'sk-or-'];

function keyProblem(key) {
  const value = String(key || '').trim();
  if (!value) {
    return 'No LLM API key is set. Add OPENCODE_API_KEY ("oc_sk_...") or OPENROUTER_API_KEY ("sk-or-...") to .env.';
  }
  if (!KNOWN_KEY_PREFIXES.some(prefix => value.startsWith(prefix))) {
    return 'The configured LLM key has an unexpected format. Expected an OpenCode Go key ("oc_sk_...") or an OpenRouter key ("sk-or-...").';
  }
  return null;
}

export function initAiComposer(config = {}) {
  _baseUrl = (config.baseUrl || aiEngine.openRouter.baseUrl).replace(/\/+$/, '');
  _apiKey = (config.apiKey || aiEngine.openRouter.apiKey || '').trim();
  _timeout = config.timeoutMs || aiEngine.openRouter.timeoutMs;
  _userAgent = config.userAgent || aiEngine.engine.userAgent;
  _isOpenCode = /opencode\.ai/i.test(_baseUrl);
  _isOpenRouter = /openrouter\.ai/i.test(_baseUrl);
  _sessionId = config.sessionId || aiEngine.openRouter.sessionId || randomUUID();

  const problem = keyProblem(_apiKey);
  if (problem) {
    console.warn(`[aiComposer] ${problem} Falling back to deterministic answers.`);
  } else {
    console.log(`[aiComposer] Ready (${_baseUrl}, key ${_apiKey.slice(0, 8)}...)`);
  }
}

function headers() {
  const result = {
    'Content-Type': 'application/json',
  };
  if (_apiKey) result.Authorization = `Bearer ${_apiKey}`;
  if (_userAgent) result['User-Agent'] = _userAgent;
  // OpenCode routes and caches on a stable session id.
  if (_isOpenCode && _sessionId) result['x-opencode-session'] = _sessionId;
  if (_isOpenRouter) {
    result['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL || 'http://localhost:5000';
    result['X-Title'] = 'aladdin-node-server';
  }
  return result;
}

function resolveModel(tier = 'default') {
  const models = aiEngine.openRouter.models;
  if (tier === 'quick') return models.quick;
  if (tier === 'deep') return models.deep;
  return models.default || models.quick;
}

/**
 * Streamless chat completion through an OpenAI-compatible provider
 * (OpenCode Go or OpenRouter). Returns { ok, content, error, model, raw }.
 */
export async function chat(messages, options = {}) {
  const problem = keyProblem(_apiKey);
  if (problem) {
    return { ok: false, content: null, error: problem, model: null, raw: null };
  }

  const model = options.model || resolveModel(options.tier || 'default');
  const payload = {
    model,
    messages,
    temperature: options.temperature != null ? options.temperature : aiEngine.openRouter.temperature,
    max_tokens: options.maxTokens || aiEngine.openRouter.maxTokensDefault,
  };

  if (Array.isArray(options.tools) && options.tools.length) {
    payload.tools = options.tools;
    payload.tool_choice = options.toolChoice || 'auto';
  }

  if (options.responseFormat) {
    payload.response_format = options.responseFormat; // { type: 'json_object' }
  }

  try {
    const response = await axios.post(`${_baseUrl}/chat/completions`, payload, {
      headers: headers(),
      timeout: _timeout,
    });
    const raw = response.data;
    const choice = raw?.choices?.[0];
    const message = choice?.message || {};
    return {
      ok: true,
      content: typeof message.content === 'string' ? message.content : null,
      toolCalls: message.tool_calls || null,
      model: raw?.model || model,
      raw,
    };
  } catch (exc) {
    const detail = exc.response?.data?.error?.message || exc.response?.data?.message || '';
    const msg = exc.message + (detail ? `: ${detail}` : '');
    if (exc.response?.status === 401) {
      console.error(`[aiComposer] 401 from ${_baseUrl}. The key was rejected - verify OPENCODE_API_KEY/OPENROUTER_API_KEY in .env is current.`);
    } else {
      console.error(`[aiComposer] Request failed (${model}): ${msg}`);
    }
    return { ok: false, content: null, error: msg, model, raw: null };
  }
}

export async function chatJson(messages, options = {}) {
  const result = await chat(messages, { ...options, responseFormat: { type: 'json_object' } });
  if (!result.ok || !result.content) return result;
  try {
    const parsed = JSON.parse(result.content);
    return { ...result, content: parsed };
  } catch (exc) {
    return { ...result, ok: false, error: `Invalid JSON from model: ${exc.message}` };
  }
}

export { resolveModel, keyProblem };