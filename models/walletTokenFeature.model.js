import mongoose from 'mongoose';

const walletTokenFeatureSchema = new mongoose.Schema({
  _id: { type: String, alias: 'id' },
  walletAddress: { type: String, required: true },
  tokenMint: { type: String, required: true },
  entryRank: Number,
  entryMc: mongoose.Schema.Types.Decimal128,
  amountBoughtSol: mongoose.Schema.Types.Decimal128,
  amountSoldSol: mongoose.Schema.Types.Decimal128,
  remainingPct: mongoose.Schema.Types.Decimal128,
  realisedPnlUsd: mongoose.Schema.Types.Decimal128,
  roiPct: mongoose.Schema.Types.Decimal128,
  buyCount: { type: Number, default: 0 },
  sellCount: { type: Number, default: 0 },
  qualityStatus: { type: String, default: 'partial' },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

walletTokenFeatureSchema.index({ walletAddress: 1, tokenMint: 1 }, { unique: true });
walletTokenFeatureSchema.index({ tokenMint: 1 });

export const WalletTokenFeature = mongoose.model('WalletTokenFeature', walletTokenFeatureSchema);
