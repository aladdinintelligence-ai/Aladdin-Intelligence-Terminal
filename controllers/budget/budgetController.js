// Internal budget / data-layer telemetry view. Lets ops see, in one call:
//   - the daily/monthly call budget snapshot and current tier
//   - breaker and auth-block states (manual opens)
//   - demand-driven hotness and active watched mints
//   - per-feed last-confirmed freshness (updatedAt/stale) from the data layer
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
    },
    hotness: state.hotness,
    activeMints: state.activeMints,
    inflight: state.inflight,
    feeds,
  });
}

export default getBudgetController;