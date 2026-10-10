import mongoose from 'mongoose';

const tokenSchema = new mongoose.Schema({
  _id: { type: String, alias: 'mint' },
  name: String,
  symbol: String,
  imageUrl: String,
  metadataUri: String,
  creator: String,
  launchTimestamp: Date,
  decimals: Number,
  supply: mongoose.Schema.Types.Decimal128,
  marketCapUsd: mongoose.Schema.Types.Decimal128,
  liquidityUsd: mongoose.Schema.Types.Decimal128,
  priceUsd: mongoose.Schema.Types.Decimal128,
  volumeUsd: mongoose.Schema.Types.Decimal128,
  holders: Number,
  buys: Number,
  sells: Number,
  migrationState: { type: String, default: 'unknown' },
  migrationProgress: mongoose.Schema.Types.Decimal128,
  provider: { type: String, default: 'solana_tracker' },
  providerSnapshotId: String,
  providerPayload: mongoose.Schema.Types.Mixed,
  qualityStatus: { type: String, default: 'partial' },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

export const Token = mongoose.model('Token', tokenSchema);
