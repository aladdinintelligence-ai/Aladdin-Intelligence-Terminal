import mongoose from 'mongoose';

const walletTokenRoleSchema = new mongoose.Schema({
  _id: { type: String, alias: 'id' },
  walletAddress: { type: String, required: true },
  tokenMint: { type: String, required: true },
  role: { type: String, required: true },
  source: { type: String, required: true },
  sourceReference: String,
  observedAt: Date,
  validFrom: Date,
  validUntil: Date,
  evidence: mongoose.Schema.Types.Mixed,
  qualityStatus: { type: String, default: 'partial' },
  providerVersion: String,
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

walletTokenRoleSchema.index({ walletAddress: 1, tokenMint: 1, role: 1, source: 1 }, { unique: true });

export const WalletTokenRole = mongoose.model('WalletTokenRole', walletTokenRoleSchema);
