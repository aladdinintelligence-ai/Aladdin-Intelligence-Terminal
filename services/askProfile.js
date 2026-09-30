import { User } from '../models/index.js';

const ENTITLEMENTS = {
  Free: { plan: 'Free', historyDays: 7, queryLimit: 25, historicalMatchLimit: 10, exports: false, sharedWorkspaces: false },
  Basic: { plan: 'Basic', historyDays: 30, queryLimit: 300, historicalMatchLimit: 50, exports: true, sharedWorkspaces: false },
  Pro: { plan: 'Pro', historyDays: 365, queryLimit: 3000, historicalMatchLimit: 250, exports: true, sharedWorkspaces: true },
};

function planFor(plan) {
  return ENTITLEMENTS[plan] || ENTITLEMENTS.Free;
}

export async function getUserProfile(userId) {
  const user = await User.findById(userId).lean();
  if (!user) return null;
  return {
    id: user._id.toString(),
    displayName: user.displayName,
    primaryProfile: user.primaryProfile || 'Trader',
    defaultAnswerMode: user.primaryProfile || 'Trader',
    timezone: user.timezone || 'Europe/London',
    walletAddress: user.wallet?.publicKey || null,
    hasWallet: Boolean(user.wallet),
  };
}

export function getEntitlements(userId, plan = 'Free') {
  void userId;
  return planFor(plan);
}

export function creditsRemaining(profile, usedThisWindow = 0) {
  const limit = profile?.plan ? ENTITLEMENTS[profile.plan]?.queryLimit : ENTITLEMENTS.Free.queryLimit;
  return Math.max(0, (limit || ENTITLEMENTS.Free.queryLimit) - usedThisWindow);
}

export const answerModeLabel = (mode) => mode || 'Trader';