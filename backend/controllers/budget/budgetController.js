// Internal budget / data-layer telemetry view. Lets ops see, in one call:
//   - the daily/monthly call budget snapshot and current tier
//   - breaker and manual-block states (auth/quota opens)
//   - demand-driven hotness and active watched mints
//   - per-feed last-confirmed freshness (updatedAt/stale) from the data layer
// Both routes are admin-only (requireAuth + requireAdmin, ADMIN_USER_IDS).
import budget from '../../providers/budgetTracker.js';
import dl from '../../providers/dataLayer.js';

export function getBudgetController(_req, res) {
  const state = dl.getState();
  const feeds = {};
  for (const feed of state.registeredFeeds) {
    const freshness = dl.lastFreshness(feed);
    if (freshness) feeds[feed] = freshness;
  }
  res.json({
    snapshot: budget.snapshot(),
    breaker: {
      bitquery: dl.internals.breakerIsOpen(dl.internals.bitqueryBreaker),
      dexscreener: dl.internals.breakerIsOpen(dl.internals.dexBreaker),
      authBlockedUntil: dl.internals.authOpenUntil(),
      quotaBlockedUntil: dl.internals.quotaOpenUntil(),
      dexQuotaBlockedUntil: dl.internals.dexQuotaOpenUntil(),
    },
    hotness: state.hotness,
    activeMints: state.activeMints,
    inflight: state.inflight,
    feeds,
  });
}

// Admin-only escape hatch: clears the manual auth/quota blocks so a corrected
// credential resumes traffic immediately, without waiting out the window or
// restarting the process (a restart also clears them — see clearOpenBlocks).
export function resetBudgetController(_req, res) {
  dl.clearOpenBlocks();
  res.json({
    ok: true,
    authBlockedUntil: dl.internals.authOpenUntil(),
    quotaBlockedUntil: dl.internals.quotaOpenUntil(),
    dexQuotaBlockedUntil: dl.internals.dexQuotaOpenUntil(),
  });
}

export default getBudgetController;
