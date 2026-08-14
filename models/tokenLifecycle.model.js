import mongoose from 'mongoose';

const tokenLifecycleSchema = new mongoose.Schema({
  _id: { type: String, alias: 'tokenMint' },
  stage: { type: String, default: 'unknown' },
  launchTime: Date,
  migrationTime: Date,
  lastTradeAt: Date,
  migrationProgress: mongoose.Schema.Types.Decimal128,
  qualityStatus: { type: String, default: 'partial' },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

export const TokenLifecycle = mongoose.model('TokenLifecycle', tokenLifecycleSchema);
