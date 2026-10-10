import mongoose from 'mongoose';

const providerRawSnapshotSchema = new mongoose.Schema({
  _id: { type: String, alias: 'id' },
  provider: { type: String, required: true },
  targetType: { type: String, required: true },
  targetId: { type: String, required: true },
  snapshotType: { type: String, required: true },
  method: { type: String, required: true },
  requestId: { type: String, required: true },
  requestParams: mongoose.Schema.Types.Mixed,
  payloadHash: { type: String, required: true },
  payload: mongoose.Schema.Types.Mixed,
  providerVersion: String,
  normalizationVersion: { type: String, default: 'normalizer_v1' },
  coverage: mongoose.Schema.Types.Decimal128,
  qualityStatus: { type: String, default: 'partial' },
  errorMetadata: mongoose.Schema.Types.Mixed,
  fetchedAt: Date,
  capturedAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

providerRawSnapshotSchema.index({ provider: 1, targetType: 1, targetId: 1, snapshotType: 1, payloadHash: 1 }, { unique: true });
providerRawSnapshotSchema.index({ provider: 1, targetType: 1, targetId: 1, capturedAt: -1 });

export const ProviderRawSnapshot = mongoose.model('ProviderRawSnapshot', providerRawSnapshotSchema);
