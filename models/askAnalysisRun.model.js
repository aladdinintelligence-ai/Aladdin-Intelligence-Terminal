import mongoose from 'mongoose';

const activityEventSchema = new mongoose.Schema({
  id: String,
  message: String,
  operation: String,
  status: { type: String, default: 'pending' },
  timestamp: Date,
  resultCount: Number,
}, { _id: false });

const askAnalysisRunSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  status: { type: String, enum: ['idle', 'running', 'complete', 'error'], default: 'running' },
  depth: { type: String, enum: ['quick', 'deep'], default: 'quick' },
  startedAt: { type: Date, default: () => new Date() },
  completedAt: Date,
  errorMessage: String,
  events: { type: [activityEventSchema], default: [] },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

askAnalysisRunSchema.index({ userId: 1, startedAt: -1 });

export const AskAnalysisRun = mongoose.model('AskAnalysisRun', askAnalysisRunSchema);