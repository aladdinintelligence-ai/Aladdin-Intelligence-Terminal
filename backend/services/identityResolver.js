import { WalletTokenRole, WalletBehaviourIdentity, WalletRecentBehaviourState } from '../models/index.js';

const ROLE_PRECEDENCE = ['creator', 'insider', 'bundler', 'sniper'];
const LABELS = {
  creator: 'Creator', insider: 'Insider', bundler: 'Bundler', sniper: 'Sniper',
  migration_specialist: 'Migration Specialist', scalper: 'Scalper', unknown: 'Unknown',
};

export async function resolveDisplayIdentity(wallet, tokenMint) {
  const roles = await getTokenRoles(wallet, tokenMint);
  for (const role of ROLE_PRECEDENCE) {
    if (roles.includes(role)) {
      return { category: 'token_role', key: role, label: LABELS[role], version: null, reason: 'token_role_precedence' };
    }
  }

  const behaviour = await WalletBehaviourIdentity.findById(wallet).lean();
  if (behaviour && ['migration_specialist', 'scalper'].includes(behaviour.primaryBehaviourKey)) {
    const key = behaviour.primaryBehaviourKey;
    return { category: 'aladdin_behaviour', key, label: LABELS[key], version: behaviour.primaryBehaviourVersion, reason: 'persistent_identity' };
  }

  return { category: 'fallback', key: 'unknown', label: 'Unknown', version: 'v1', reason: 'no_role_or_supported_behaviour' };
}

export async function getTokenRoles(wallet, tokenMint) {
  const rows = await WalletTokenRole.find({ walletAddress: wallet, tokenMint }).select('role').lean();
  return rows.map(r => r.role.toLowerCase());
}

export async function getRecentBehaviour(wallet, windowDays = 30) {
  const row = await WalletRecentBehaviourState.findOne({ walletAddress: wallet, windowDays })
    .sort({ windowEnd: -1 }).limit(1).lean();
  return row || null;
}
