import mongoose from 'mongoose';

const walletFeatureSchema = new mongoose.Schema({
  _id: { type: String, alias: 'walletAddress' },
  tokensTraded: { type: Number, default: 0 },
  buySellRatio: mongoose.Schema.Types.Decimal128,
  winRate: mongoose.Schema.Types.Decimal128,
  migrationEntries: { type: Number, default: 0 },
  averageEntryRank: mongoose.Schema.Types.Decimal128,
  featureSetVersion: { type: String, default: 'wallet_features_v1' },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

export const WalletFeature = mongoose.model('WalletFeature', walletFeatureSchema);
