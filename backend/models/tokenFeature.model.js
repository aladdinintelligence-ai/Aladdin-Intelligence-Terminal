import mongoose from 'mongoose';

const tokenFeatureSchema = new mongoose.Schema({
  _id: { type: String, alias: 'tokenMint' },
  uniqueBuyers: { type: Number, default: 0 },
  uniqueSellers: { type: Number, default: 0 },
  buySellRatio: mongoose.Schema.Types.Decimal128,
  holderCount: Number,
  top10Concentration: mongoose.Schema.Types.Decimal128,
  first100Retention: mongoose.Schema.Types.Decimal128,
  migrationSpecialistShare: mongoose.Schema.Types.Decimal128,
  sniperShare: mongoose.Schema.Types.Decimal128,
  qualityStatus: { type: String, default: 'partial' },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

export const TokenFeature = mongoose.model('TokenFeature', tokenFeatureSchema);
