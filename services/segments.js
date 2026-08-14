export function classifyWallet(features) {
  const segments = [];
  const buyCount = Number(features.buy_count || features.buyCount || 0);
  const sellCount = Number(features.sell_count || features.sellCount || 0);
  const remainingPct = Number(features.remaining_pct || features.remainingPct || 0);
  const roiPct = Number(features.roi_pct || features.roiPct || 0);
  const entryRank = features.entry_rank || features.entryRank;

  if (buyCount <= 2 && sellCount === 0) {
    segments.push({ segment: 'Fresh Wallet', confidence: 0.45, evidence: { buyCount, sellCount } });
  }
  if (buyCount + sellCount >= 8 && remainingPct <= 10) {
    segments.push({ segment: 'Scalper', confidence: 0.70, evidence: { tradeCount: buyCount + sellCount, remainingPct } });
  }
  if (entryRank != null && Number(entryRank) <= 100 && remainingPct >= 50) {
    segments.push({ segment: 'High Conviction Holder', confidence: 0.65, evidence: { entryRank, remainingPct } });
  }
  if (roiPct > 0 && remainingPct > 0 && buyCount >= 2) {
    segments.push({ segment: 'Momentum Buyer', confidence: 0.50, evidence: { roiPct, remainingPct } });
  }
  return segments;
}
