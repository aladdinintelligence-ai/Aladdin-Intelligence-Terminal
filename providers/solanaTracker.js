import { randomUUID } from 'crypto';
import axios from 'axios';

let _baseUrl = '';
let _apiKey = '';
let _timeout = 20000;

export function initSolanaTrackerProvider(config) {
  _baseUrl = (config.baseUrl || 'https://data.solanatracker.io').replace(/\/+$/, '');
  _apiKey = config.apiKey || '';
  _timeout = config.timeoutMs || 20000;
}

function headers() {
  const h = { Accept: 'application/json' };
  if (_apiKey) h['x-api-key'] = _apiKey;
  return h;
}

function makeResult(method, params, payload, fetchedAt, requestId, quality = 'partial', coverage = null, error = null) {
  return { provider: 'solana_tracker', method, params, payload, fetchedAt, requestId, providerVersion: null, qualityStatus: quality, coverage, error };
}

async function doGet(method, path, params = {}) {
  const requestId = randomUUID();
  try {
    const response = await axios.get(`${_baseUrl}${path}`, { params, headers: headers(), timeout: _timeout });
    const payload = response.data;
    const quality = payload ? 'complete' : 'unavailable';
    return makeResult(method, params, payload, new Date().toISOString(), requestId, quality);
  } catch (exc) {
    return makeResult(method, params, null, new Date().toISOString(), requestId, 'unavailable', 0.0, exc.message);
  }
}

export async function fetchTokenSummary(mint) {
  return doGet('token_summary', `/tokens/${mint}`);
}

export async function fetchTokenTrades(mint, limit = 100) {
  return doGet('token_trades', `/trades/${mint}`, { limit });
}

export async function fetchTokenHolders(mint, limit = 100) {
  return doGet('token_holders', `/tokens/${mint}/holders/paginated`, { limit });
}

export async function fetchFirstBuyers(mint, limit = 100) {
  return doGet('first_buyers', `/v2/pnl/tokens/${mint}/first-buyers`, { limit });
}

export async function fetchProfitableTraders(mint, limit = 100) {
  return doGet('profitable_traders', `/v2/pnl/tokens/${mint}/traders`, { limit });
}

export async function fetchTokenRoles(mint) {
  return doGet('token_roles', `/tokens/${mint}/roles`);
}

export async function fetchWalletTokenPosition(wallet, mint) {
  return doGet('wallet_token_position', `/v2/pnl/wallets/${wallet}/tokens/${mint}`);
}

export async function fetchTokenLifecycle(mint) {
  return doGet('token_lifecycle', `/events/${mint}`);
}
