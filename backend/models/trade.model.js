import mongoose from 'mongoose';

const tradeSchema = new mongoose.Schema({
  _id: { type: String, alias: 'id' },
  tokenMint: { type: String, required: true, index: true },
  walletAddress: { type: String, required: true, index: true },
  transactionSignature: { type: String, required: true },
  side: { type: String, required: true, enum: ['buy', 'sell'] },
  blockTime: { type: Date, index: true },
  slot: Number,
  solAmount: mongoose.Schema.Types.Decimal128,
  usdAmount: mongoose.Schema.Types.Decimal128,
  tokenAmount: mongoose.Schema.Types.Decimal128,
  priceUsd: mongoose.Schema.Types.Decimal128,
  marketCapUsd: mongoose.Schema.Types.Decimal128,
  provider: { type: String, default: 'solana_tracker' },
  providerSnapshotId: String,
  providerPayload: mongoose.Schema.Types.Mixed,
  qualityStatus: { type: String, default: 'partial' },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

tradeSchema.index({ tokenMint: 1, blockTime: -1 });
tradeSchema.index({ walletAddress: 1, blockTime: -1 });
tradeSchema.index({ tokenMint: 1, transactionSignature: 1, walletAddress: 1, side: 1 }, { unique: true });

export const Trade = mongoose.model('Trade', tradeSchema);
