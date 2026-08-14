import mongoose from 'mongoose';

const walletTokenPositionSchema = new mongoose.Schema({
  _id: { type: String, alias: 'id' },
  walletAddress: { type: String, required: true },
  tokenMint: { type: String, required: true },
  buyCount: { type: Number, default: 0 },
  sellCount: { type: Number, default: 0 },
  boughtSol: mongoose.Schema.Types.Decimal128,
  soldSol: mongoose.Schema.Types.Decimal128,
  realisedPnlUsd: mongoose.Schema.Types.Decimal128,
  unrealisedPnlUsd: mongoose.Schema.Types.Decimal128,
  roiPct: mongoose.Schema.Types.Decimal128,
  remainingPct: mongoose.Schema.Types.Decimal128,
  firstTradeAt: Date,
  lastTradeAt: Date,
  costBasisStatus: { type: String, default: 'unavailable' },
  entryRank: Number,
  providerSnapshotId: String,
  providerPayload: mongoose.Schema.Types.Mixed,
  qualityStatus: { type: String, default: 'partial' },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

walletTokenPositionSchema.index({ walletAddress: 1, tokenMint: 1 }, { unique: true });
walletTokenPositionSchema.index({ tokenMint: 1, realisedPnlUsd: -1 });

export const WalletTokenPosition = mongoose.model('WalletTokenPosition', walletTokenPositionSchema);
