const isProd = process.env.NODE_ENV === "production";

const truthy = (v) => v === "true" || v === "1";

/**
 * Cookie attributes for the auth token.
 *
 * The browser is what actually accepts or rejects this cookie, so a wrong
 * Domain or SameSite value fails silently: the login endpoint still returns
 * 200 and the user looks signed in, but the cookie is never stored (or never
 * sent on cross-site requests), so every authenticated route answers
 * "Authentication required". GET /api/auth/config reports the resolved values
 * so this can be checked against the live deployment.
 */
const cookieDomain = process.env.COOKIE_DOMAIN?.trim() || undefined;

// Cross-site cookies require SameSite=None together with Secure, and browsers
// drop the cookie entirely over plain HTTP. Default to that in production, but
// allow explicit overrides for hosts that do not set NODE_ENV=production.
const secure = process.env.COOKIE_SECURE ? truthy(process.env.COOKIE_SECURE) : isProd;
const sameSiteRaw = (process.env.COOKIE_SAMESITE || (isProd ? "none" : "lax")).toLowerCase();
const sameSite = ["none", "lax", "strict"].includes(sameSiteRaw) ? sameSiteRaw : (isProd ? "none" : "lax");

const shared = {
  httpOnly: true,
  secure,
  sameSite,
  path: "/",
  ...(cookieDomain ? { domain: cookieDomain } : {}),
};

export const authCookieOptions = {
  ...shared,
  maxAge: 24 * 60 * 60 * 1000,
};

// clearCookie must be given the same attributes used when setting the cookie,
// otherwise the browser keeps the original cookie instead of deleting it.
export const authCookieClearOptions = { ...shared };

export const authCookieDiagnostics = {
  isProd,
  secure,
  sameSite,
  domain: cookieDomain ?? null,
  hostOnly: !cookieDomain,
};
