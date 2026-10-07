// Resilient provider data layer. All upstream Bitquery / DexScreener traffic
// must flow through this module (or through controllers built on it). It layers:
//   - LRU cache with fresh/stale tiers and stale-while-revalidate
//   - in-flight coalescing (identical keys share one upstream call)
//   - a client-side token bucket per provider (below the plan limits)
//   - retry with exponential backoff + jitter on 429/5xx, honoring Retry-After,
//     capped attempts and a per-request total time budget; retries re-enter the
//     FIFO concurrency gate in providers/index.js
//   - an opossum circuit breaker per provider (bad-query 4xx is never counted;
//     402/quota trips a long manual open)
//   - budget gates from providers/budgetTracker.js (hard stop at the 100% tier)
//   - demand-driven refresh bookkeeping (feeds refresh only while hot, telemetry
//     only while a client actively polls, bot/internal sources excluded)
// It never throws to callers: on total failure with no cache it returns a
// structured { unavailable: true } result.

import axios from 'axios';
import { LRUCache } from 'lru-cache';
import CircuitBreaker from 'opossum';
import config from '../configs/dataLayer.js';
import { budget } from './budgetTracker.js';
import { graphql as gatedGraphql } from './index.js';

const quoteRe = /quota|point limit|points limit|rate limit|session limit|concurrent|402/i;

const cache = new LRUCache({
  max: config.cacheMaxEntries,
  maxSize: config.cacheMaxSizeBytes,
  sizeCalculation: (value) => estimateSize(value),
});

const inflight = new Map();
const hotness = new Map();
const mintActivity = new Map();

// Negative cache: permanent client errors (403 dataset/plan-forbidden, other
// bad-query 4xx) are cached per query so identical lookups stop spending calls
// until they expire (~10 min by default).
const negativeCache = new Map();

let bitqueryResolver = (query, label, opts) => gatedGraphql(query, label, opts);
let dexResolver = (mints, opts) => requestDexChunk(mints, opts);

const bitqueryBreaker = new CircuitBreaker(
  async (query, label, opts) => {
    let raw;
    try {
      raw = await bitqueryResolver(query, label, opts);
    } catch (err) {
      raw = { error: err && err.message ? err.message : 'bitquery error', status: err && err.response ? err.response.status : 0, retryAfterMs: parseRetryAfter(err) };
    }
    const s = classifyWithStatus(raw);
    // Bad-query / plan-forbidden 4xx (e.g. 403 dataset) and quota/402 and auth
    // (401) are never retried AND never counted against the circuit breaker:
    // 403/quota mean the query/dataset is permanently bad, 401 is a credential
    // rejection that opens a long manual block instead (see bitquery auth
    // branch). Only upstream/retryable failures reject so opossum can open
    // the circuit on them.
    if (s.error && s.kind !== 'ok' && s.kind !== 'client' && s.kind !== 'quota' && s.kind !== 'auth') {
      const e = new Error(s.error);
      if (s.retryAfterMs) e.retryAfterMs = s.retryAfterMs;
      throw e;
    }
    return s;
  },
  {
    name: 'bitquery',
    timeout: config.requestTimeoutMs,
    resetTimeout: config.breakerTimeoutMs,
    errorThresholdPercentage: Math.min(Math.max(config.breakerFailures * 10, 10), 90),
    volumeThreshold: 10,
  }
);

const dexBreaker = new CircuitBreaker(
  async (chunk, timeoutMs) => {
    try {
      return { map: await dexResolver(chunk, { timeoutMs }) };
    } catch (err) {
      const status = err && err.response ? err.response.status : 0;
      const msg = String((err && err.message) || err);
      if (status === 402) return { error: msg, status: 402 };
      if (status >= 400 && status < 500) return { error: msg, status };
      throw err;
    }
  },
  {
    name: 'dexscreener',
    timeout: config.requestTimeoutMs,
    resetTimeout: config.breakerTimeoutMs,
    errorThresholdPercentage: Math.min(Math.max(config.breakerFailures * 10, 10), 90),
    volumeThreshold: 10,
  }
);

let quotaOpenUntil = 0;
let dexQuotaOpenUntil = 0;
let authOpenUntil = 0;
let now = () => Date.now();

export function initDataLayer({ bitqueryResolver: bq, dexResolver: dx, timeFn } = {}) {
  if (bq) bitqueryResolver = bq;
  if (dx) dexResolver = dx;
  if (timeFn) now = timeFn;
}

function estimateSize(value) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 512;
  }
}

let tokenBucketEnabled = true;
export function setTokenBucketEnabled(v) {
  tokenBucketEnabled = v;
}

class TokenBucket {
  constructor(ratePerMin, burst) {
    this.ratePerSec = ratePerMin / 60;
    this.cap = Math.max(burst, 1);
    this.tokens = this.cap;
    this.last = now();
  }

  async take() {
    if (!tokenBucketEnabled) return;
    for (;;) {
      const t = now();
      this.tokens = Math.min(this.cap, this.tokens + (t - this.last) / 1000 * this.ratePerSec);
      this.last = t;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = ((1 - this.tokens) / this.ratePerSec) * 1000;
      await new Promise((r) => setTimeout(r, Math.max(waitMs, 1)));
    }
  }

  deposit(count) {
    this.tokens = Math.min(this.cap, this.tokens + count);
  }

  reset() {
    this.tokens = this.cap;
    this.last = now();
  }
}

const bitqueryBucket = new TokenBucket(config.bitqueryRatePerMin, 5);
const dexBucket = new TokenBucket(config.dexRatePerMin, 5);

function classify(res) {
  const msg = String(res.error || '');
  const status = res.status || 0;
  if (!res.error) return { kind: 'ok' };
  // 402 and quota phrasing = permanent until the quota window passes (long
  // manual open). 429 = transient throttle -> retryable, honoring Retry-After.
  if (status === 429) return { kind: 'retryable' };
  if (status === 402) return { kind: 'quota' };
  // 401 = the key is being rejected: never retried, never negative-cached,
  // forces a long manual open + loud log (see bitquery auth branch).
  if (status === 401) return { kind: 'auth' };
  const quota = quoteRe.test(msg);
  if (quota) return { kind: 'quota' };
  if (status >= 400 && status < 500) return { kind: 'client' };
  return { kind: 'retryable' };
}

function parseRetryAfter(err) {
  const h = err && err.response && err.response.headers && err.response.headers['retry-after'];
  if (!h) return 0;
  const n = Number(h);
  if (Number.isFinite(n) && n > 0) return n * 1000;
  const t = Date.parse(h);
  return Number.isFinite(t) ? Math.max(t - Date.now(), 0) : 0;
}

function classifyWithStatus(raw) {
  const s = { ...(raw || {}), status: (raw && raw.status) || inferStatus(raw && raw.error) };
  return { ...s, kind: classify(s).kind };
}

function inferStatus(msg) {
  const m = /status code (\d{3})/.exec(String(msg || ''));
  return m ? Number(m[1]) : 0;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt, retryAfterMs) {
  if (retryAfterMs) {
    const clamped = Math.min(Math.max(retryAfterMs, 500), 12_000);
    return clamped + Math.floor(Math.random() * 100);
  }
  const exp = Math.min(config.retryBaseMs * Math.pow(2, attempt), config.retryMaxMs);
  return exp + Math.floor(Math.random() * exp * 0.25);
}

// opossum v8+: `breaker.opened` is a boolean getter; `breaker.open` (v9)
// is a mutator that OPENs the circuit, not a state check.
function breakerIsOpen(breaker) {
  if (typeof breaker.opened === 'boolean') return breaker.opened;
  return typeof breaker.open === 'boolean' ? breaker.open : false;
}

// Feeds can be disabled at the source (DL_DISABLED_FEEDS) so controllers and
// schedulers stop spending calls against a query the plan no longer allows.
export function isFeedEnabled(feed = 'data') {
  return !config.disabledFeeds.includes(feed);
}

function queryHash(query) {
  let h = 5381;
  for (let i = 0; i < query.length; i++) h = ((h << 5) + h + query.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function negativeCacheGet(query) {
  const entry = negativeCache.get(queryHash(query));
  if (!entry) return null;
  if (now() <= entry.expiresAt) {
    return { ...entry.res, cached: true, at: entry.at };
  }
  negativeCache.delete(queryHash(query));
  return null;
}

function negativeCacheSet(query, res, ttlMs) {
  negativeCache.set(queryHash(query), {
    at: now(),
    expiresAt: now() + (ttlMs || config.negativeCacheTtlMs),
    res: { error: res.error, status: res.status, data: null },
  });
}

// Caches a successful-but-empty result (well-formed key with no backing data)
// so identical lookups stop spending calls until the marker expires. Returned
// on repeat as { status: 200, data: null, empty: true, cached: true }.
function cacheEmpty(query, ttlMs) {
  negativeCache.set(queryHash(query), {
    at: now(),
    expiresAt: now() + (ttlMs || config.negativeCacheTtlMs),
    res: { error: undefined, status: 200, data: null, empty: true },
  });
}

// Per-feed freshness ledger. every bitquery() completion records the state of
// the attempt so consumers (ask answers, controller metas) can state the real
// last-confirmed-upstream time and whether the data being served is current or
// stale, instead of guessing from a has_data flag. `lastGoodByFeed` keeps the
// newest confirmed-good timestamp; `lastServingByFeed` remembers the most
// recent attempt so callers know if the current serve is stale.
const lastGoodByFeed = new Map();
const lastServingByFeed = new Map();

function finish(feed, res) {
  const out = { ...res, updatedAt: res.updatedAt || new Date(now()).toISOString(), stale: res.stale === true };
  if (out.stale === false && typeof out.updatedAt === 'string') {
    const prev = lastGoodByFeed.get(feed);
    if (!prev || prev < out.updatedAt) lastGoodByFeed.set(feed, out.updatedAt);
  }
  lastServingByFeed.set(feed, { updatedAt: out.updatedAt, stale: out.stale });
  return out;
}

// Latest freshness for a feed: `updatedAt` is always the newest confirmed-good
// timestamp (kept across stale serves) and `stale` says whether the current
// serving is confirmed or is old/error data. Returns null before the feed has
// ever resolved once.
export function lastFreshness(feed = 'data') {
  const serving = lastServingByFeed.get(feed);
  const good = lastGoodByFeed.get(feed) || null;
  if (!serving) return good ? { updatedAt: good, stale: false } : null;
  return { updatedAt: serving.stale ? good : serving.updatedAt || good, stale: serving.stale };
}

export async function bitquery(query, label = '', { feed = 'data', priority = 'user', emptyTtlMs, isEmpty } = {}) {
  const started = now();
  if (!isFeedEnabled(feed)) return finish(feed, { error: 'FEED_DISABLED', status: 503, data: null });
  const cached = negativeCacheGet(query);
  if (cached) return finish(feed, { ...cached, updatedAt: new Date(cached.at).toISOString(), stale: true });
  let attempt = 0;
  for (;;) {
    if (!budget.canFire()) return finish(feed, { error: 'BUDGET_EXHAUSTED', status: 429, data: null, stale: true });
    if (breakerIsOpen(bitqueryBreaker) || now() < quotaOpenUntil || now() < authOpenUntil) return finish(feed, { error: 'bitquery breaker open', status: 503, data: null, stale: true });
    await bitqueryBucket.take();
    if (now() - started > config.requestTimeoutMs) return finish(feed, { error: 'request time budget exceeded', status: 0, data: null, stale: true });
    let res;
    try {
      res = await bitqueryBreaker.fire(query, label, { feed, priority });
    } catch (e) {
      res = { error: e && e.message ? e.message : 'bitquery error', status: e && e.status ? e.status : 503, retryAfterMs: e && e.retryAfterMs ? e.retryAfterMs : 0 };
    }
    budget.addCall(feed, res.points || 0, 'bitquery');
    if (res.kind === 'quota') {
      quotaOpenUntil = now() + config.breakerQuotaOpenMs;
      console.log(`[DATA] bitquery quota hit (${label}): blocking upstream for ${config.breakerQuotaOpenMs}ms`);
      return finish(feed, { error: res.error, status: 402, data: null, stale: true });
    }
    if (res.kind === 'auth') {
      // Credential rejection: do not retry, do not negative-cache, open a long
      // manual block, and log loudly so ops sees the key is being turned away.
      authOpenUntil = now() + config.authBreakerOpenMs;
      console.error(`[DATA] bitquery AUTH failure (${label}): ${res.error} — blocking upstream for ${config.authBreakerOpenMs}ms`);
      return finish(feed, { error: res.error, status: 401, data: null, stale: true });
    }
    if (res.kind === 'client') {
      // Permanent for this query (bad syntax, forbidden dataset/plan):
      // negative-cache it (~10 min) so identical lookups spend no calls.
      negativeCacheSet(query, res);
      return finish(feed, { error: res.error, status: res.status || 400, data: null, stale: true });
    }
    if (!res.error) {
      if (isEmpty && isEmpty(res.data)) {
        cacheEmpty(query, emptyTtlMs);
        return finish(feed, { status: 200, data: null, empty: true, cached: false, stale: true });
      }
      return finish(feed, { ...res, stale: false });
    }
    attempt += 1;
    if (attempt >= config.retryMax) return finish(feed, { ...res, stale: true });
    if (now() - started > config.requestTimeoutMs) return finish(feed, { ...res, stale: true });
    await sleep(backoffMs(attempt - 1, res.retryAfterMs || null));
  }
}

async function requestDexChunk(mints, { timeoutMs } = {}) {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${mints.join(',')}`;
  const res = await axios.get(url, { timeout: timeoutMs || config.requestTimeoutMs });
  const map = {};
  for (const mint of mints) {
    const pairs = res.data && res.data.pairs ? res.data.pairs.filter((p) => p.pairAddress) : [];
    const tokenPairs = pairs.filter((p) => p.baseToken && mints.includes(p.baseToken.address));
    map[mint] = tokenPairs.length ? tokenPairs : [];
  }
  return map;
}

function isClientStatus(status) {
  return status >= 400 && status < 500 && status !== 429;
}

export async function dexBatch(mints, { feed = 'dexscreener', timeoutMs } = {}) {
  const list = Array.isArray(mints) ? mints : [mints];
  const merged = {};
  for (let i = 0; i < list.length; i += 30) {
    const chunk = list.slice(i, i + 30);
    const started = now();
    for (;;) {
      if (!budget.canFire()) return { error: 'BUDGET_EXHAUSTED', status: 429 };
      if (breakerIsOpen(dexBreaker) || now() < dexQuotaOpenUntil) return { error: 'dexscreener breaker open', status: 503 };
      await dexBucket.take();
      if (now() - started > config.requestTimeoutMs) return { error: 'dexscreener time budget exceeded', status: 0 };
      let out;
      try {
        out = await dexBreaker.fire(chunk, timeoutMs);
      } catch (err) {
        out = { error: String((err && err.message) || err), status: 0 };
      }
      budget.addCall(feed, 0, 'dexscreener');
      if (out.error) {
        if (out.status === 402) {
          dexQuotaOpenUntil = now() + config.breakerQuotaOpenMs;
          console.log('[DATA] dexscreener quota/unexpected: blocking upstream');
          return out;
        }
        if (isClientStatus(out.status)) return out;
        if (now() - started > config.requestTimeoutMs) return out;
        continue;
      }
      Object.assign(merged, out.map || {});
      break;
    }
  }
  return merged;
}

export async function fetch({ key, feed = 'data', freshTtlMs, staleTtlMs, priority = 'user', force = false, passiveStale = false, request }) {
  if (!isFeedEnabled(feed)) return { unavailable: true, code: 'FEED_DISABLED' };
  if (!config.enabled) {
    try {
      return { data: await request(), fresh: true, updatedAt: now() };
    } catch (e) {
      return { unavailable: true, code: 'UPSTREAM_UNAVAILABLE' };
    }
  }

  const freshMs = freshTtlMs || config.feedFreshTtlMs;
  const staleMs = staleTtlMs || config.feedStaleTtlMs;
  const hit = cache.get(key);

  if (!force && hit) {
    const age = now() - hit.ts;
    if (age <= freshMs) return { data: hit.data, fresh: true, updatedAt: hit.ts };
    if (age <= staleMs) {
      // passiveStale: serve old data WITHOUT starting a background refresh.
      // Used where refreshes are owned by an internal scheduler (tokenDetail
      // watch) so a client poll can never spend an upstream call.
      if (!passiveStale) scheduleRevalidate(key, { feed, freshTtlMs, staleTtlMs, request });
      return { data: hit.data, fresh: false, stale: true, updatedAt: hit.ts };
    }
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const prom = (async () => {
    if (!budget.canFire()) {
      const staleHit = cache.get(key);
      if (staleHit) return { data: staleHit.data, fresh: false, stale: true, updatedAt: staleHit.ts };
      return { unavailable: true, code: 'BUDGET_EXHAUSTED' };
    }
    try {
      const data = await request();
      cache.set(key, { data, ts: now() });
      return { data, fresh: true, updatedAt: now() };
    } catch (e) {
      const stale = cache.get(key);
      if (stale) return { data: stale.data, fresh: false, stale: true, updatedAt: stale.ts };
      console.log(`[DATA] fetch failed for ${key}: ${e && e.message ? e.message : e}`);
      return { unavailable: true, code: 'UPSTREAM_UNAVAILABLE' };
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, prom);
  return prom;
}

function scheduleRevalidate(key, opts) {
  if (inflight.has(`r:${key}`)) return;
  const p = revalidateNow(key, opts);
  inflight.set(`r:${key}`, p);
  p.finally(() => inflight.delete(`r:${key}`));
}

async function revalidateNow(key, { feed, freshTtlMs, staleTtlMs, request }) {
  if (!budget.canFire()) return;
  try {
    const data = await request();
    cache.set(key, { data, ts: now() });
  } catch (e) {
    console.log(`[DATA] revalidate failed for ${key}: ${e && e.message ? e.message : e}`);
  }
}

// ---- demand-driven refresh bookkeeping ----

const botRe = new RegExp(config.botUserAgentPattern, 'i');
const excludedPaths = config.hotExcludedPaths.split(',').map((s) => s.trim()).filter(Boolean);

function isBot({ userAgent }) {
  return userAgent ? botRe.test(userAgent) : true;
}

function isExcludedPath(path) {
  if (!path) return false;
  return excludedPaths.some((p) => path.startsWith(p));
}

export function isRealUserRequest({ userAgent, path, internal = false }) {
  if (internal) return false;
  if (isExcludedPath(path)) return false;
  return !isBot({ userAgent });
}

export function markUserRequest(feed, { userAgent, path, internal = false } = {}) {
  if (!config.demandDriven) return;
  if (!isRealUserRequest({ userAgent, path, internal })) return;
  hotness.set(feed, now());
  pruneHotness();
}

export function isHot(feed) {
  const ts = hotness.get(feed);
  if (!ts) return false;
  if (now() - ts <= config.hotWindowMs) return true;
  hotness.delete(feed);
  return false;
}

function pruneHotness() {
  const limit = now() - config.hotWindowMs;
  for (const [k, ts] of hotness) if (ts < limit) hotness.delete(k);
}

export function markMintActive(mint) {
  if (!mint) return;
  mintActivity.set(mint, now());
  pruneMints();
}

function pruneMints() {
  const limit = now() - config.telemetryMintIdleMs;
  for (const [m, ts] of mintActivity) if (ts < limit) mintActivity.delete(m);
}

export function activeMints() {
  pruneMints();
  const entries = [...mintActivity.entries()].sort((a, b) => b[1] - a[1]);
  return entries.slice(0, config.telemetryMaxActiveMints).map(([m]) => m);
}

// ---- feed registry + scheduler ----

const feeds = new Map();
const lastRefresh = new Map();

export function registerFeed(name, { cadenceMs, critical = false, job }) {
  feeds.set(name, {
    name,
    cadenceMs: cadenceMs || config.feedCadences[name] || 15 * 60_000,
    critical,
    job,
  });
}

export function unregisterFeed(name) {
  feeds.delete(name);
  lastRefresh.delete(name);
}

async function refreshFeed(feed, t) {
  if (config.demandDriven && !isHot(feed.name)) return;
  let cadence = feed.cadenceMs;
  if (t.id >= 2 && !feed.critical) return;
  if (t.id >= 1) cadence *= 2;
  if (t.id >= 2) cadence *= 1.5;
  const since = now() - (lastRefresh.get(feed.name) || 0);
  if (since < cadence) return;
  lastRefresh.set(feed.name, now());
  try {
    await feed.job();
  } catch (e) {
    console.log(`[DATA] feed refresh failed for ${feed.name}: ${e && e.message ? e.message : e}`);
  }
}

async function refreshTelemetry(t) {
  if (t.id >= 1) return;
  const mints = activeMints();
  for (const mint of mints) {
    const key = `tel:${mint}`;
    const since = now() - (lastRefresh.get(key) || 0);
    if (since < config.telemetryCadenceMs) continue;
    lastRefresh.set(key, now());
    const job = telemetryJobs.get(mint);
    if (job) {
      try {
        await job();
      } catch {
        /* keep stale */
      }
    }
  }
}

const telemetryJobs = new Map();
export function registerMintTelemetry(mint, job) {
  telemetryJobs.set(mint, job);
}
export function unregisterMintTelemetry(mint) {
  telemetryJobs.delete(mint);
  lastRefresh.delete(`tel:${mint}`);
}

let schedulerTimer = null;
export function tick() {
  const t = budget.tier();
  for (const feed of feeds.values()) refreshFeed(feed, t).catch(() => {});
  refreshTelemetry(t).catch(() => {});
}

export function startScheduler() {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => tick(), Math.min(config.telemetryCadenceMs, 30_000));
  schedulerTimer.unref?.();
}

export function stopScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
}

// Cache probes for controllers: a request whose key is neither cached nor
// already building would spend an upstream call (a "cold build"), which is the
// only thing worth rate limiting.
export function hasCached(key) {
  return cache.has(key);
}

export function hasInflight(key) {
  return inflight.has(key);
}

export function getState() {
  return {
    hotness: [...hotness.entries()].map(([k, ts]) => [k, ts]),
    activeMints: activeMints(),
    inflight: inflight.size,
    registeredFeeds: [...feeds.keys()],
    config: config,
  };
}

export function resetCacheState() {
  cache.clear();
  inflight.clear();
  hotness.clear();
  mintActivity.clear();
  lastRefresh.clear();
  negativeCache.clear();
  lastGoodByFeed.clear();
  lastServingByFeed.clear();
  tokenBucketEnabled = true;
  bitqueryBucket.reset();
  dexBucket.reset();
  quotaOpenUntil = 0;
  dexQuotaOpenUntil = 0;
  authOpenUntil = 0;
}

// Clears ONLY the manual provider blocks (auth/quota opens) without touching
// caches or counters — the admin escape hatch for "the key was fixed, resume
// traffic now" (POST /api/internal/budget/reset). A process restart reaches
// the same state naturally, because these opens are module-level variables
// that re-initialize to 0.
export function clearOpenBlocks() {
  quotaOpenUntil = 0;
  dexQuotaOpenUntil = 0;
  authOpenUntil = 0;
}

export const internals = {
  TokenBucket,
  bitqueryBucket,
  dexBucket,
  bitqueryBreaker,
  dexBreaker,
  breakerIsOpen,
  isFeedEnabled,
  classifyWithStatus,
  negativeCache,
  cacheEmpty,
  authOpenUntil: () => authOpenUntil,
  quotaOpenUntil: () => quotaOpenUntil,
  dexQuotaOpenUntil: () => dexQuotaOpenUntil,
};

export default {
  initDataLayer,
  fetch,
  bitquery,
  dexBatch,
  markUserRequest,
  isRealUserRequest,
  isHot,
  internals,
  markMintActive,
  activeMints,
  registerFeed,
  unregisterFeed,
  registerMintTelemetry,
  unregisterMintTelemetry,
  tick,
  startScheduler,
  stopScheduler,
  getState,
  hasCached,
  hasInflight,
  resetCacheState,
  clearOpenBlocks,
  setTokenBucketEnabled,
  isFeedEnabled,
  lastFreshness,
  budget,
};