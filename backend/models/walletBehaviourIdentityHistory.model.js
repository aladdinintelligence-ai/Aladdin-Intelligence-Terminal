import mongoose from 'mongoose';

const walletBehaviourIdentityHistorySchema = new mongoose.Schema({
  _id: { type: String, alias: 'id' },
  walletAddress: { type: String, required: true, index: true },
  previousBehaviourKey: String,
  newBehaviourKey: { type: String, required: true },
  newBehaviourVersion: { type: String, default: 'v1' },
  transitionReason: String,
  evidenceSnapshot: mongoose.Schema.Types.Mixed,
  changedAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

export const WalletBehaviourIdentityHistory = mongoose.model('WalletBehaviourIdentityHistory', walletBehaviourIdentityHistorySchema);
