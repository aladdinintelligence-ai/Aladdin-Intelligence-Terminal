import mongoose from 'mongoose';

const walletRecentBehaviourStateSchema = new mongoose.Schema({
  _id: { type: String, alias: 'id' },
  walletAddress: { type: String, required: true },
  windowDays: { type: Number, required: true },
  windowStart: { type: Date, required: true },
  windowEnd: { type: Date, required: true },
  dominantBehaviourKey: { type: String, default: 'unknown' },
  migrationSpecialistScore: mongoose.Schema.Types.Decimal128,
  scalperScore: mongoose.Schema.Types.Decimal128,
  evidenceStrength: mongoose.Schema.Types.Decimal128,
  coveragePct: mongoose.Schema.Types.Decimal128,
  episodesObserved: { type: Number, default: 0 },
  tokensObserved: { type: Number, default: 0 },
  supportingFeatures: mongoose.Schema.Types.Mixed,
  qualityStatus: { type: String, default: 'unavailable' },
  computedAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

walletRecentBehaviourStateSchema.index({ walletAddress: 1, windowDays: 1, windowStart: 1, windowEnd: 1 }, { unique: true });
walletRecentBehaviourStateSchema.index({ walletAddress: 1, windowEnd: -1 });

export const WalletRecentBehaviourState = mongoose.model('WalletRecentBehaviourState', walletRecentBehaviourStateSchema);
