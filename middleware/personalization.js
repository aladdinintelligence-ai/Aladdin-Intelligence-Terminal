import { askProfile } from '../services/index.js';

/**
 * Loads the signed-in user's profile (displayName, timezone, primaryProfile,
 * walletAddress) and entitlement plan into req.profile. Must run after requireAuth.
 */
export async function applyProfile(req, _res, next) {
  try {
    if (!req.user?.userId) {
      req.profile = null;
      return next();
    }
    const profile = await askProfile.getUserProfile(req.user.userId);
    req.profile = {
      ...profile,
      entitlements: askProfile.getEntitlements(req.user.userId, process.env.USER_DEFAULT_PLAN || 'Free'),
    };
    return next();
  } catch (err) {
    console.error(`[profile] applyProfile failed:`, err.message);
    req.profile = null;
    return next();
  }
}