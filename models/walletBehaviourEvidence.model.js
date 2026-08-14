import mongoose from 'mongoose';

const walletBehaviourEvidenceSchema = new mongoose.Schema({
  _id: { type: String, alias: 'id' },
  walletAddress: { type: String, required: true, index: true },
  scope: { type: String, required: true },
  windowStart: Date,
  windowEnd: Date,
  migrationSpecialistScore: mongoose.Schema.Types.Decimal128,
  scalperScore: mongoose.Schema.Types.Decimal128,
  evidenceStrength: mongoose.Schema.Types.Decimal128,
  coveragePct: mongoose.Schema.Types.Decimal128,
  episodesObserved: { type: Number, default: 0 },
  tokensObserved: { type: Number, default: 0 },
  supportingFeatures: mongoose.Schema.Types.Mixed,
  qualityStatus: { type: String, default: 'unavailable' },
  qualityReasons: [String],
  calculationVersion: { type: String, default: 'behaviour_evidence_v1' },
  computedAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

export const WalletBehaviourEvidence = mongoose.model('WalletBehaviourEvidence', walletBehaviourEvidenceSchema);
