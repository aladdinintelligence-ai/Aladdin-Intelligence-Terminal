import mongoose from 'mongoose';

const walletTokenEpisodeSchema = new mongoose.Schema({
  _id: { type: String, alias: 'id' },
  walletAddress: { type: String, required: true },
  tokenMint: { type: String, required: true },
  episodeIndex: { type: Number, required: true },
  openedAt: Date,
  closedAt: Date,
  firstBuyAt: Date,
  lastBuyAt: Date,
  firstSellAt: Date,
  lastSellAt: Date,
  entryMarketCapUsd: mongoose.Schema.Types.Decimal128,
  exitMarketCapUsd: mongoose.Schema.Types.Decimal128,
  boughtTokenAmount: mongoose.Schema.Types.Decimal128,
  soldTokenAmount: mongoose.Schema.Types.Decimal128,
  remainingTokenAmount: mongoose.Schema.Types.Decimal128,
  boughtSol: mongoose.Schema.Types.Decimal128,
  soldSol: mongoose.Schema.Types.Decimal128,
  holdingDurationSeconds: Number,
  holdingDurationSoFar: Number,
  durationCensored: { type: Boolean, default: false },
  preMigrationBoughtTokenAmount: mongoose.Schema.Types.Decimal128,
  postMigrationSoldTokenAmount: mongoose.Schema.Types.Decimal128,
  heldThroughMigration: Boolean,
  realisedPnlUsd: mongoose.Schema.Types.Decimal128,
  roiPct: mongoose.Schema.Types.Decimal128,
  episodeStatus: { type: String, default: 'unknown' },
  coverageStatus: { type: String, default: 'partial' },
  calculationVersion: { type: String, default: 'episode_v1' },
  computedAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

walletTokenEpisodeSchema.index({ walletAddress: 1, tokenMint: 1, episodeIndex: 1 }, { unique: true });
walletTokenEpisodeSchema.index({ walletAddress: 1, tokenMint: 1 });

export const WalletTokenEpisode = mongoose.model('WalletTokenEpisode', walletTokenEpisodeSchema);
