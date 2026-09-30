/**
 * In-memory sliding-window rate limiter, keyed by user id (or IP fallback).
 */
function createRateLimiter({ windowMs = 60_000, max = 30, keyPrefix = 'ai' } = {}) {
  const buckets = new Map();

  const keyFor = (req) => {
    if (req.user && req.user.userId) return `${keyPrefix}:${req.user.userId}`;
    return `${keyPrefix}:ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
  };

  return function rateLimiter(req, res, next) {
    const key = keyFor(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      buckets.set(key, bucket);
    }

    bucket.timestamps = bucket.timestamps.filter((ts) => ts > windowStart);

    if (bucket.timestamps.length >= max) {
      const oldest = bucket.timestamps[0];
      const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: `Rate limit exceeded. Try again in ${retryAfter}s.` });
      return;
    }

    bucket.timestamps.push(now);
    next();
  };
}

export { createRateLimiter };