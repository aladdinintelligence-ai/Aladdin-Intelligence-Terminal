import mongoose from 'mongoose';

const cohortMembershipSchema = new mongoose.Schema({
  _id: { type: String, alias: 'id' },
  cohortId: { type: String, required: true },
  tokenMint: { type: String, required: true },
  walletAddress: { type: String, required: true },
  evidence: mongoose.Schema.Types.Mixed,
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

cohortMembershipSchema.index({ cohortId: 1, tokenMint: 1, walletAddress: 1 }, { unique: true });
cohortMembershipSchema.index({ tokenMint: 1 });

export const CohortMembership = mongoose.model('CohortMembership', cohortMembershipSchema);
