import crypto from 'crypto';
import { WalletTokenRole } from '../models/index.js';

const TOKEN_ROLE_KEYS = new Set(['creator', 'insider', 'bundler', 'sniper']);

export function stableId(...parts) {
  return crypto.createHash('sha256').update(parts.map(p => String(p || '')).join('|')).digest('hex');
}

export async function upsertTokenRole(wallet, tokenMint, roleKey, source = 'solana_tracker', evidence = {}) {
  const role = roleKey.toLowerCase();
  if (!TOKEN_ROLE_KEYS.has(role)) throw new Error(`Unsupported token role: ${roleKey}`);
  const id = stableId(wallet, tokenMint, role, source);
  const now = new Date();
  await WalletTokenRole.findOneAndUpdate(
    { walletAddress: wallet, tokenMint, role, source },
    { $set: { _id: id, evidence, observedAt: now, validFrom: now, qualityStatus: 'partial' } },
    { upsert: true, new: true }
  );
}
