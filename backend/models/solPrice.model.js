import mongoose from 'mongoose';

// Single-document store for the last known SOL/USD price. The _id doubles as
// the key ('sol-usd'), so reads and upserts are atomic against one doc.
const solPriceSchema = new mongoose.Schema({
  _id: { type: String, alias: 'id' },
  price: { type: Number, required: true, default: 100 },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

export const SolPrice = mongoose.model('SolPrice', solPriceSchema);
