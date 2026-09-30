import { AskConversation } from '../models/index.js';

const MAX_SESSIONS = 12;

function normaliseSession(session) {
  const now = new Date().toISOString();
  return {
    id: session.id || `session-${Date.now()}`,
    title: session.title || 'Untitled investigation',
    primaryProfile: session.primaryProfile || 'Trader',
    answerMode: session.answerMode || 'Trader',
    entityId: session.entityId || '',
    entityLabel: session.entityLabel || 'No entity selected',
    entityType: session.entityType || 'none',
    analysisPeriod: session.analysisPeriod || null,
    questions: session.questions || [],
    turns: session.turns || [],
    generatedNextQuestions: session.generatedNextQuestions || [],
    savedQueryIds: session.savedQueryIds || [],
    dashboardIds: session.dashboardIds || [],
    exportIds: session.exportIds || [],
    pinned: Boolean(session.pinned),
    status: session.status || 'active',
    createdAt: session.createdAt || now,
    updatedAt: now,
  };
}

async function getDoc(userId) {
  const doc = await AskConversation.findOne({ userId });
  if (doc) return doc;
  return AskConversation.create({ userId, sessions: [] });
}

export async function listSessions(userId) {
  const doc = await AskConversation.findOne({ userId }).lean();
  const items = (doc?.sessions || []).map(normaliseSession);
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveSession(userId, session) {
  const item = normaliseSession(session);
  const doc = await getDoc(userId);
  const existing = (doc.sessions || []).find((s) => s.id === item.id);
  let next = item;
  if (existing) {
    doc.sessions = doc.sessions.map((s) => (s.id === item.id ? item : s));
  } else {
    doc.sessions = [item, ...(doc.sessions || [])];
  }
  doc.sessions = doc.sessions.slice(0, MAX_SESSIONS);
  await doc.save();
  return next;
}

export async function deleteSession(userId, id) {
  const doc = await getDoc(userId);
  doc.sessions = (doc.sessions || []).filter((s) => s.id !== id);
  await doc.save();
  return { ok: true };
}

export async function duplicateSession(userId, id) {
  const doc = await getDoc(userId);
  const source = (doc.sessions || []).find((s) => s.id === id);
  if (!source) return null;
  const now = new Date().toISOString();
  const copy = normaliseSession({
    ...source,
    id: `session-${Date.now()}`,
    title: `${source.title} copy`,
    createdAt: now,
    updatedAt: now,
    pinned: false,
    status: 'active',
  });
  return saveSession(userId, copy);
}

export async function getActiveSession(userId, sessionId) {
  const items = await listSessions(userId);
  if (!items.length) return null;
  return items.find((s) => s.id === sessionId) || items[0];
}