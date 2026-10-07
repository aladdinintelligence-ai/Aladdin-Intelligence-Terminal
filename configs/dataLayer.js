// Data-layer configuration. Every knob is env-overridable so cadences and
// limits can be tuned by restarting with new env values, without redeploying
// controller code. Defaults encode the approved Bitquery Pro budget plan
// (90 req/min, 6 concurrent, ~1M points/month; we reserve headroom).

const num = (envKey, fallback) => {
  const v = process.env[envKey];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const str = (envKey, fallback) => (process.env[envKey] !== undefined && process.env[envKey] !== '' ? process.env[envKey] : fallback);

const bool = (envKey, fallback) => {
  const v = process.env[envKey];
  if (v === undefined || v === '') return fallback;
  return v.toLowerCase() === 'true' || v === '1';
};

// Per-feed warm cadence (ms) when the feed is "hot" (demand-driven).
// Override with DL_CADENCE_<UPPER_FEED_NAME>, e.g. DL_CADENCE_FORMATION=1800000.
const FEED_CADENCES = {
  movers: 6 * 60_000,
  launches: 12 * 60_000,
  og: 15 * 60_000,
  smartMoney: 15 * 60_000,
  insider: 15 * 60_000,
  historical: 30 * 60_000,
  formation: 30 * 60_000,
  cluster: 30 * 60_000,
};

const resolvedFeedCadences = {};
for (const [name, fallbackMs] of Object.entries(FEED_CADENCES)) {
  resolvedFeedCadences[name] = num(`DL_CADENCE_${name.toUpperCase()}`, fallbackMs);
}

export const dataLayerConfig = {
  enabled: bool('DL_ENABLED', true),

  // Bitquery concurrency: approved 6-sim plan, we keep 5 max with 1 slot
  // reserved for user-triggered cold requests (see dataLayer.priority).
  maxConcurrent: num('DL_MAX_CONCURRENT', 5),
  backgroundConcurrent: num('DL_BACKGROUND_CONCURRENT', 4),
  bitqueryRatePerMin: num('DL_BITQUERY_RATE_PER_MIN', 70),
  dexRatePerMin: num('DL_DEX_RATE_PER_MIN', 250),

  // Request transport. The heaviest approved analytical builds scan tens of
  // thousands of trade rows (perBuildGql: smartMoney/historical/formation/
  // cluster), so a single query can legitimately take well over 30s when it
  // queues behind the concurrency/budget gates. 120s covers the longest such
  // turn while the budget gate keeps total spend bounded.
  requestTimeoutMs: num('DL_REQUEST_TIMEOUT_MS', 120_000),
  retryMax: num('DL_RETRY_MAX', 3),
  retryBaseMs: num('DL_RETRY_BASE_MS', 300),
  retryMaxMs: num('DL_RETRY_MAX_MS', 5_000),

  // Circuit breaker per provider
  breakerTimeoutMs: num('DL_BREAKER_TIMEOUT_MS', 90_000),
  breakerFailures: num('DL_BREAKER_FAILURE_THRESHOLD', 5), // percentage *10 => opossum uses %; see dataLayer
  breakerQuotaOpenMs: num('DL_QUOTA_OPEN_MS', 15 * 60_000), // long open on 402/quota

  // Cache
  cacheMaxEntries: num('DL_CACHE_MAX_ENTRIES', 4_000),
  cacheMaxSizeBytes: num('DL_CACHE_MAX_SIZE_BYTES', 60 * 1024 * 1024),
  feedFreshTtlMs: num('DL_FRESH_TTL_MS', 120_000),
  feedStaleTtlMs: num('DL_STALE_TTL_MS', 10 * 60_000),
  telemetryFreshTtlMs: num('DL_TELEMETRY_FRESH_TTL_MS', 30_000),
  telemetryStaleTtlMs: num('DL_TELEMETRY_STALE_TTL_MS', 3 * 60_000),
  negativeCacheTtlMs: num('DL_NEGATIVE_CACHE_TTL_MS', 10 * 60_000),

  // Feeds disabled at the source (e.g. OHLC chart while the query needs a
  // dataset tier the current plan forbids). Comma-separated feed names.
  disabledFeeds: (process.env.DL_DISABLED_FEEDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Demand-driven refresh
  demandDriven: bool('DL_DEMAND_DRIVEN', true),
  hotWindowMs: num('DL_HOT_WINDOW_MS', 30 * 60_000),
  telemetryCadenceMs: num('DL_TELEMETRY_CADENCE_MS', 5 * 60_000),
  telemetryMaxActiveMints: num('DL_TELEMETRY_MAX_ACTIVE_MINTS', 3),
  telemetryMintIdleMs: num('DL_TELEMETRY_MINT_IDLE_MS', 60_000),

  // Budget
  dailyCapOverride: num('DL_DAILY_CAP', 0), // 0 => derive from monthly
  monthlyPointCap: num('DL_MONTHLY_POINT_CAP', 1_000_000),
  estimatedCallsPerMonth: num('DL_CALLS_PER_MONTH', 200_000),
  tier1: num('DL_TIER_1', 0.7),
  tier2: num('DL_TIER_2', 0.9),
  tier3: num('DL_TIER_3', 1.0),

  // Persistence
  flushIntervalMs: num('DL_FLUSH_INTERVAL_MS', 30_000),

  // Bots / internal sources excluded from demand-driven hotness
  hotExcludedPaths: str('DL_HOT_EXCLUDE_PATHS', '/health,/api/health'),
  botUserAgentPattern: str('DL_BOT_UA_PATTERN', 'bot|crawler|spider|uptime|curl|wget|headless|node-fetch'),

  feedCadences: resolvedFeedCadences,
  perBuildGql: {
    // informational projection (approved v3 table)
    movers: 2,
    launches: 5,
    og: 3,
    smartMoney: 4,
    insider: 7,
    historical: 7,
    formation: 9,
    cluster: 12,
  },
};

export default dataLayerConfig;