import jwt from 'jsonwebtoken';
import { authCookieOptions } from '../configs/services/cookieOptions.js';
import { generateJWT, shouldRefreshJWT } from '../services/authService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'aladdin-dev-secret-change-in-production';

// Bearer header first (mobile/3rd-party clients), then the browser cookie.
function readToken(req) {
  const header = req.headers && req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

export function requireAuth(req, res, next) {
  const token = readToken(req);

  if (!token) {
    // Distinguish "no credential reached us" from "credential was rejected".
    // When a cross-site Set-Cookie is refused by the browser the request still
    // arrives with no token, which is otherwise indistinguishable from a user
    // who never signed in. Surface the likely cause so this is diagnosable.
    if (req.method !== 'GET' && req.headers.origin) {
      console.warn(
        `[auth] 401 ${req.method} ${req.originalUrl} — no token; origin=${req.headers.origin}. ` +
        'If sign-in succeeded, the auth cookie was not stored: check COOKIE_DOMAIN covers the API host, ' +
        'NODE_ENV=production sets SameSite=None+Secure (needs HTTPS), and CORS allows credentials.'
      );
    }
    return res.status(401).json({ error: 'Authentication required' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    console.warn(`[auth] 401 ${req.method} ${req.originalUrl} — token present but rejected: ${err.message}`);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = { userId: payload.userId };

  // Sliding session: if the token is still valid but getting old, mint a fresh
  // token and bump the cookie expiry forward. This keeps active users logged
  // in while enforcing a hard cap via the cookie's maxAge.
  try {
    if (shouldRefreshJWT(token)) {
      const newToken = generateJWT(payload.userId, { maxAgeMs: authCookieOptions.maxAge });
      res.cookie('token', newToken, authCookieOptions);
    }
  } catch (refreshErr) {
    console.warn(`[auth] failed to refresh token on ${req.method} ${req.originalUrl}: ${refreshErr.message}`);
  }

  next();
}

// ADMIN_USER_IDS (comma-separated account userIds) gates internal ops
// endpoints. Runs after requireAuth, so unauthenticated callers are already
// stopped with 401 and this only ever denies authenticated non-admins.
export function requireAdmin(req, res, next) {
  const admins = (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const userId = req.user && req.user.userId;
  if (!userId || !admins.includes(userId)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}

// Populates req.user when a valid token IS present, but never rejects the
// request — used on public routes (token-detail) so the cold-build limiter can
// apply a per-user window to signed-in callers while anonymous traffic falls
// back to the per-IP window. Invalid/expired tokens are treated as anonymous.
export function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { userId: payload.userId };
  } catch {
    /* anonymous */
  }
  return next();
}
