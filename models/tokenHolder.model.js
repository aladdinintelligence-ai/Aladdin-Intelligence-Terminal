import mongoose from 'mongoose';

const tokenHolderSchema = new mongoose.Schema({
  _id: { type: String, alias: 'id' },
  tokenMint: { type: String, required: true },
  walletAddress: { type: String, required: true },
  supply: mongoose.Schema.Types.Decimal128,
  supplyPct: mongoose.Schema.Types.Decimal128,
  usdValue: mongoose.Schema.Types.Decimal128,
  soldRemainingPct: mongoose.Schema.Types.Decimal128,
  firstObservedAt: Date,
  lastObservedAt: Date,
  providerSnapshotId: String,
  providerPayload: mongoose.Schema.Types.Mixed,
  qualityStatus: { type: String, default: 'partial' },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

tokenHolderSchema.index({ tokenMint: 1, walletAddress: 1 }, { unique: true });
tokenHolderSchema.index({ tokenMint: 1, supply: -1 });

export const TokenHolder = mongoose.model('TokenHolder', tokenHolderSchema);
