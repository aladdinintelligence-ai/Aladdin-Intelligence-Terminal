// Per-user / per-IP sliding-window limiter for COLD token-detail builds.
//
// Only a request that would spend an upstream Bitquery call is counted: a
// cache hit (fresh or passively stale) and a request that joins an already
// in-flight build of the same key are both free, so the stage-3 guarantee
// that a client poll can never spend an upstream call is unchanged. Two
// dimensions are checked independently before either is consumed:
//   - a signed-in caller's cold builds are capped across all their IPs
//   - one IP's cold builds are capped across all users behind it
// Above the limit the caller serves cached data when it exists, otherwise 429.
import config from '../configs/dataLayer.js';

const MAX_BUCKETS = 10_000;

function createWindow() {
  const stamps = [];

  function prune(now) {
    const windowStart = now - config.detailColdBuildWindowMs;
    let i = 0;
    while (i < stamps.length && stamps[i] <= windowStart) i += 1;
    if (i > 0) stamps.splice(0, i);
  }

  return {
    // Non-consuming probe so both dimensions can be validated first.
    check(now) {
      prune(now);
      if (stamps.length >= config.detailColdBuildRatePerMin) {
        const oldest = stamps[0];
        return {
          allowed: false,
          retryAfter: Math.max(1, Math.ceil((oldest + config.detailColdBuildWindowMs - now) / 1000)),
        };
      }
      return { allowed: true, retryAfter: 0 };
    },
    commit(now) {
      prune(now);
      stamps.push(now);
    },
    lastAt: () => (stamps.length ? stamps[stamps.length - 1] : 0),
    reset: () => { stamps.length = 0; },
  };
}

const userWindows = new Map();
const ipWindows = new Map();

function pruneBuckets(map, now) {
  if (map.size < MAX_BUCKETS) return;
  const horizon = now - config.detailColdBuildWindowMs;
  for (const [key, w] of map) {
    if (w.lastAt() <= horizon) map.delete(key);
  }
}

function windowFor(map, key, now) {
  let w = map.get(key);
  if (w) return w;
  pruneBuckets(map, now);
  w = createWindow();
  map.set(key, w);
  return w;
}

export function normalizeIp(ip) {
  return (ip || 'unknown').replace(/^::ffff:/, '');
}

// Counts one cold build. Returns { allowed, retryAfter, reason } with reason
// 'user_rate' | 'ip_rate' | 'ok'. Both windows must have room before either
// is charged, so a denial on one dimension never leaks a slot on the other.
export function take(userId, ip, now = Date.now()) {
  const dims = [];
  if (userId) dims.push({ reason: 'user_rate', key: `u:${userId}`, map: userWindows });
  dims.push({ reason: 'ip_rate', key: `i:${normalizeIp(ip)}`, map: ipWindows });

  for (const dim of dims) {
    const verdict = windowFor(dim.map, dim.key, now).check(now);
    if (!verdict.allowed) return { allowed: false, retryAfter: verdict.retryAfter, reason: dim.reason };
  }
  for (const dim of dims) windowFor(dim.map, dim.key, now).commit(now);
  return { allowed: true, retryAfter: 0, reason: 'ok' };
}

export function reset() {
  userWindows.clear();
  ipWindows.clear();
}

export function state() {
  return {
    users: userWindows.size,
    ips: ipWindows.size,
    maxPerMin: config.detailColdBuildRatePerMin,
    windowMs: config.detailColdBuildWindowMs,
  };
}

export default { take, reset, state, normalizeIp };
