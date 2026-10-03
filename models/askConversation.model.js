import mongoose from 'mongoose';

const queryFilterSchema = new mongoose.Schema({
  field: String,
  operator: String,
  value: mongoose.Schema.Types.Mixed,
}, { _id: false });

const conversationTurnSchema = new mongoose.Schema({
  id: { type: String, required: true },
  question: { type: String, required: true },
  answer: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: () => new Date() },
  analysisPeriod: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  primaryProfile: { type: String, default: 'Trader' },
  answerMode: { type: String, default: 'Trader' },
  entityId: { type: String, default: '' },
  entityLabel: { type: String, default: 'No entity selected' },
  entityType: { type: String, default: 'none' },
  analysisPeriod: { type: mongoose.Schema.Types.Mixed, default: null },
  questions: { type: [String], default: [] },
  turns: { type: [conversationTurnSchema], default: [] },
  generatedNextQuestions: { type: [String], default: [] },
  savedQueryIds: { type: [String], default: [] },
  dashboardIds: { type: [String], default: [] },
  exportIds: { type: [String], default: [] },
  pinned: { type: Boolean, default: false },
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
}, { _id: false });

const askConversationSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  sessions: { type: [sessionSchema], default: [] },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

export const AskConversation = mongoose.model('AskConversation', askConversationSchema);