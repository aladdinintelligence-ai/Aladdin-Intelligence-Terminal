import mongoose from 'mongoose';

const walletSegmentSchema = new mongoose.Schema({
  _id: { type: String, alias: 'id' },
  walletAddress: { type: String, required: true },
  segment: { type: String, required: true },
  confidence: { type: Number, default: 0 },
  definitionVersion: { type: String, default: 'rules_v1' },
  evidence: mongoose.Schema.Types.Mixed,
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

walletSegmentSchema.index({ walletAddress: 1, segment: 1, definitionVersion: 1 }, { unique: true });

export const WalletSegment = mongoose.model('WalletSegment', walletSegmentSchema);
