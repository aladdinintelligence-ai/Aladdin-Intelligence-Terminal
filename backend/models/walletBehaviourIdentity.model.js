import mongoose from 'mongoose';

const walletBehaviourIdentitySchema = new mongoose.Schema({
  _id: { type: String, alias: 'walletAddress' },
  primaryBehaviourKey: { type: String, default: 'unknown' },
  primaryBehaviourVersion: { type: String, default: 'v1' },
  identityStatus: { type: String, default: 'unknown' },
  evidenceStrength: mongoose.Schema.Types.Decimal128,
  coveragePct: mongoose.Schema.Types.Decimal128,
  episodesObserved: { type: Number, default: 0 },
  tokensObserved: { type: Number, default: 0 },
  supportingFeatures: mongoose.Schema.Types.Mixed,
  establishedAt: Date,
  lastConfirmedAt: Date,
  calculationVersion: { type: String, default: 'identity_v1' },
  qualityStatus: { type: String, default: 'unavailable' },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

export const WalletBehaviourIdentity = mongoose.model('WalletBehaviourIdentity', walletBehaviourIdentitySchema);
