import * as bitquery from './bitquery.js';
import * as chainstream from './chainstream.js';
import { createGate } from './gate.js';

const providerName = (process.env.DATA_PROVIDER || 'bitquery').toLowerCase();

const providers = {
  bitquery,
  chainstream,
};

const active = providers[providerName] || providers.bitquery;

if (!providers[providerName]) {
  console.warn(`[PROVIDER] Unknown DATA_PROVIDER "${providerName}", falling back to bitquery`);
}

console.log(`[PROVIDER] Using ${providerName} as data provider`);

export const {
  graphql: rawGraphql,
  fetchNewTokens,
  fetchAlmostBondedTokens,
  fetchMigratedTokens,
  fetchTrendingTokens,
  fetchTokenDetails,
  fetchTokenOHLC,
  fetchMovers,
} = active;

// The provider enforces a per-session concurrency limit and rejects bursts of
// simultaneous GraphQL calls with "too many concurrent queries". All traffic
// flows through graphql() (directly for the intelligence controllers, or via
// the resilient dataLayer in providers/dataLayer.js), serialized through a
// small priority FIFO gate. Gate sizing is authoritative from the DL_* env
// namespace (configs/dataLayer.js is the single reader); the legacy
// PROVIDER_MAX_CONCURRENT var is deliberately NOT consulted here so an old
// .env value cannot silently keep the pool below the approved plan (e.g. 3).
// Pool = DL_MAX_CONCURRENT (default 5), background capped at
// DL_BACKGROUND_CONCURRENT (default 4), which reserves one slot for
// user-triggered requests.
import { dataLayerConfig } from '../configs/dataLayer.js';

const MAX_CONCURRENT = Math.max(dataLayerConfig.maxConcurrent, 1);
const BACKGROUND_CONCURRENT = Math.max(
  dataLayerConfig.backgroundConcurrent > 0 ? dataLayerConfig.backgroundConcurrent : Math.min(MAX_CONCURRENT - 1, 4),
  0
);

const gate = createGate({
  maxConcurrent: MAX_CONCURRENT,
  backgroundConcurrent: BACKGROUND_CONCURRENT,
  transport: rawGraphql,
});

export const graphql = gate.gated;

export function gateState() {
  return gate.state();
}

export const provider = providerName;
