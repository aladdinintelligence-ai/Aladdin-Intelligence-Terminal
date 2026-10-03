import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'aladdin-dev-secret-change-in-production';

export function requireAuth(req, res, next) {
  let token = null;

  // Try Authorization header first (for mobile/3rd-party clients)
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7);
  }

  // Fall back to cookie (for browser clients)
  if (!token && req.cookies?.token) {
    token = req.cookies.token;
  }

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

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { userId: payload.userId };
    next();
  } catch (err) {
    console.warn(`[auth] 401 ${req.method} ${req.originalUrl} — token present but rejected: ${err.message}`);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
