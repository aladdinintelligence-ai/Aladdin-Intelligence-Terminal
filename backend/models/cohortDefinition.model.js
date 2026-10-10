import mongoose from 'mongoose';

const cohortDefinitionSchema = new mongoose.Schema({
  _id: { type: String, alias: 'id' },
  name: { type: String, required: true },
  description: String,
  definition: mongoose.Schema.Types.Mixed,
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

export const CohortDefinition = mongoose.model('CohortDefinition', cohortDefinitionSchema);
