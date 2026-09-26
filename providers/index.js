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
  graphql,
  fetchNewTokens,
  fetchAlmostBondedTokens,
  fetchMigratedTokens,
  fetchTrendingTokens,
  fetchTokenDetails,
  fetchTokenOHLC,
  fetchMovers,
} = active;

export const provider = providerName;
