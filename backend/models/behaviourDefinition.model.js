import mongoose from 'mongoose';

const behaviourDefinitionSchema = new mongoose.Schema({
  _id: { type: String, alias: 'id' },
  key: { type: String, required: true },
  version: { type: String, required: true },
  name: { type: String, required: true },
  description: String,
  featureRequirements: mongoose.Schema.Types.Mixed,
  ruleConfiguration: mongoose.Schema.Types.Mixed,
  observationWindowDays: Number,
  status: { type: String, default: 'draft' },
  validFrom: Date,
  validTo: Date,
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

behaviourDefinitionSchema.index({ key: 1, version: 1 }, { unique: true });

export const BehaviourDefinition = mongoose.model('BehaviourDefinition', behaviourDefinitionSchema);
