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
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { userId: payload.userId };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
