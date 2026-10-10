/* CoinGecko SOL price proxy with a short fresh TTL, stale-on-failure serving,
 * and single-flight refreshes so the top bar never depends on a browser hitting
 * CoinGecko directly. Importing this module arms no timers of its own.
 */
const DEFAULT_CONFIG = {
  fetchSolPrice: null,
  freshTtlMs: 15_000,
  requestTimeoutMs: 4_000,
  coinGeckoUrl: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
};

function nowIso() {
  return new Date().toISOString();
}

export function createSolPrice(config = {}) {
  const { fetchSolPrice, freshTtlMs, requestTimeoutMs, coinGeckoUrl } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  let cached = null;
  let inflight = null;

  async function fetchFromCoinGecko() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), requestTimeoutMs);
    try {
      const res = await fetch(coinGeckoUrl, {
        signal: ctrl.signal,
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`coinGecko responded ${res.status}`);
      const body = await res.json();
      const usd = body?.solana?.usd;
      if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) {
        throw new Error('coinGecko payload missing solana.usd');
      }
      return usd;
    } finally {
      clearTimeout(timer);
    }
  }

  async function refresh() {
    if (inflight) return inflight;
    const loader = fetchSolPrice || fetchFromCoinGecko;
    const pending = loader()
      .then(usd => {
        cached = { usd, fetchedAt: nowIso() };
      })
      .catch(err => {
        console.error(`[PRICE] SOL upstream failure: ${err.message}`);
      })
      .finally(() => {
        inflight = null;
      });
    inflight = pending;
    return pending;
  }

  function build(fresh) {
    return {
      data: { price: cached ? cached.usd : null },
      meta: {
        source: 'coingecko',
        fetchedAt: cached ? cached.fetchedAt : null,
        fresh,
      },
    };
  }

  async function get() {
    if (cached && Date.now() - Date.parse(cached.fetchedAt) < freshTtlMs) {
      return build(true);
    }
    const hadCache = Boolean(cached);
    if (!inflight) refresh();
    if (hadCache) return build(false);
    await refresh();
    return cached ? build(true) : build(false);
  }

  function reset() {
    cached = null;
  }

  return {
    get,
    reset,
    state: () => ({ cached, inflight: Boolean(inflight) }),
  };
}