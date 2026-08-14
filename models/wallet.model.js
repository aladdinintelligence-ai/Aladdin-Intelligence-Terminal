import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema({
  _id: { type: String, alias: 'address' },
  firstSeenAt: Date,
  lastSeenAt: Date,
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

export const Wallet = mongoose.model('Wallet', walletSchema);
