import * as bitquery from './bitquery.js';
import * as chainstream from './chainstream.js';

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
// simultaneous GraphQL calls with "too many concurrent queries". All of the
// intelligence controllers funnel through graphql(), so we serialize queries
// app-wide through a small FIFO gate. This keeps every controller under the
// limit even when their refresh timers coincide for a moment.
const MAX_CONCURRENT = Math.max(Number(process.env.PROVIDER_MAX_CONCURRENT) || 3, 1);
let activeQueries = 0;
const queue = [];

function runGated(task) {
  activeQueries++;
  task().finally(() => {
    activeQueries--;
    const next = queue.shift();
    if (next) runGated(next);
  });
}

function gatedGraphql(query, label) {
  return new Promise((resolve, reject) => {
    const task = () => Promise.resolve(rawGraphql(query, label)).then(resolve, reject);
    if (activeQueries < MAX_CONCURRENT) runGated(task);
    else queue.push(task);
  });
}

export const graphql = gatedGraphql;

export const provider = providerName;
