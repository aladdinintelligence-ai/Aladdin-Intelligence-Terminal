import mongoose from 'mongoose';

const watchlistItemSchema = new mongoose.Schema({
  mint: { type: String, required: true },
  symbol: { type: String, default: '' },
  name: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  // Snapshot taken at add time; GET /api/watchlist prefers live DexScreener
  // stats and falls back to this when the upstream is unavailable.
  priceUsd: { type: Number, default: null },
  marketCapUsd: { type: Number, default: null },
  priceChange24h: { type: Number, default: null },
  volume24h: { type: Number, default: null },
}, { _id: false });

const watchlistSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  items: { type: [watchlistItemSchema], default: [] },
}, { timestamps: true });

watchlistSchema.index({ userId: 1 }, { unique: true });

export const Watchlist = mongoose.model('Watchlist', watchlistSchema);
