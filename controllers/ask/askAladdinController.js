import { randomUUID } from 'crypto';
import { runAskAladdin, resolveAnalysisPeriod } from '../../services/aiEngine.js';
import { AskAnalysisRun } from '../../models/index.js';
import * as sessionsService from '../../services/askSessions.js';

const VALID_MODES = ['Trader', 'Analyst', 'Token Creator'];
const VALID_DEPTHS = ['quick', 'deep'];

function validateAskBody(body) {
  if (!body || typeof body.question !== 'string' || !body.question.trim()) {
    return { error: 'question is required' };
  }
  if (!VALID_MODES.includes(body.mode)) {
    return { error: `mode must be one of ${VALID_MODES.join(', ')}` };
  }
  if (body.depth && !VALID_DEPTHS.includes(body.depth)) {
    return { error: `depth must be one of ${VALID_DEPTHS.join(', ')}` };
  }
  return { error: null };
}

function writeFrame(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function askAladdinController(req, res) {
  const { error } = validateAskBody(req.body);
  if (error) return res.status(400).json({ error });

  const { question, mode, period, hasPriorContext, currentEntityId, depth } = req.body;
  const sessionId = typeof req.body.sessionId === 'string' && req.body.sessionId ? req.body.sessionId : `session-${Date.now()}`;
  const userId = req.user.userId;
  const timezone = req.profile?.timezone || 'Europe/London';
  const walletAddress = req.profile?.walletAddress || null;
  const analysisPeriod = period || resolveAnalysisPeriod(question, new Date(), timezone);

  const runDoc = await AskAnalysisRun.create({
    sessionId,
    userId,
    status: 'running',
    depth: depth || 'quick',
    startedAt: new Date(),
    events: [],
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const onActivity = (events) => {
    writeFrame(res, { type: 'activity', events });
    AskAnalysisRun.updateOne({ _id: runDoc._id }, { $set: { events } }).catch(() => {});
  };

  let closed = false;
  const onClose = () => {
    closed = true;
    AskAnalysisRun.updateOne(
      { _id: runDoc._id, status: 'running' },
      { $set: { status: 'idle', events: [] } }
    ).catch(() => {});
  };
  req.on('close', onClose);

  try {
    const result = await runAskAladdin(
      {
        question,
        mode,
        period: analysisPeriod,
        hasPriorContext: Boolean(hasPriorContext),
        currentEntityId: currentEntityId || walletAddress || undefined,
        depth: depth || 'quick',
      },
      { onActivity, pauseMs: 420 }
    );

    onActivity(result.activityEvents);
    if (!closed) {
      writeFrame(res, { type: 'complete', result });
      res.end();
    }
    await AskAnalysisRun.updateOne(
      { _id: runDoc._id },
      { $set: { status: 'complete', completedAt: new Date(), events: result.activityEvents, result } }
    ).catch(() => {});
  } catch (exc) {
    console.error('[ask] analysis failed:', exc.message);
    if (!closed) {
      writeFrame(res, { type: 'error', error: exc.message || 'Analysis failed' });
      res.end();
    }
    await AskAnalysisRun.updateOne(
      { _id: runDoc._id },
      { $set: { status: 'error', errorMessage: exc.message, completedAt: new Date() } }
    ).catch(() => {});
  }
}

export async function listSessionsController(req, res, next) {
  try {
    const sessions = await sessionsService.listSessions(req.user.userId);
    return res.json({ data: sessions });
  } catch (exc) {
    return next(exc);
  }
}

export async function saveSessionController(req, res, next) {
  try {
    const session = await sessionsService.saveSession(req.user.userId, req.body);
    return res.json({ data: session });
  } catch (exc) {
    return next(exc);
  }
}

export async function deleteSessionController(req, res, next) {
  try {
    await sessionsService.deleteSession(req.user.userId, req.params.id);
    return res.json({ ok: true });
  } catch (exc) {
    return next(exc);
  }
}

export async function duplicateSessionController(req, res, next) {
  try {
    const session = await sessionsService.duplicateSession(req.user.userId, req.params.id);
    if (!session) return res.status(404).json({ error: 'session_not_found' });
    return res.json({ data: session });
  } catch (exc) {
    return next(exc);
  }
}

export async function getActiveSessionController(req, res, next) {
  try {
    const session = await sessionsService.getActiveSession(req.user.userId, req.params.id || req.query.id);
    if (!session) return res.status(404).json({ error: 'session_not_found' });
    return res.json({ data: session });
  } catch (exc) {
    return next(exc);
  }
}

export async function getProfileController(req, res, next) {
  try {
    const { User } = await import('../../models/user.model.js');
    const user = await User.findById(req.user.userId).lean();
    if (!user) return res.status(404).json({ error: 'user_not_found' });
    const timezone = typeof req.body?.timezone === 'string' && req.body.timezone ? req.body.timezone : null;
    return res.json({
      data: {
        id: user._id.toString(),
        displayName: user.displayName,
        primaryProfile: user.primaryProfile || 'Trader',
        defaultAnswerMode: user.primaryProfile || 'Trader',
        timezone: timezone || user.timezone || 'Europe/London',
        walletAddress: user.wallet?.publicKey || null,
        hasWallet: Boolean(user.wallet),
        entitlements: {
          plan: 'Free', historyDays: 7, queryLimit: 25, historicalMatchLimit: 10, exports: false, sharedWorkspaces: false,
        },
      },
    });
  } catch (exc) {
    return next(exc);
  }
}

export async function patchProfileController(req, res, next) {
  try {
    const { User } = await import('../../models/user.model.js');
    const updates = {};
    if (req.body.timezone !== undefined) updates.timezone = req.body.timezone;
    if (req.body.primaryProfile !== undefined) updates.primaryProfile = req.body.primaryProfile;
    const user = await User.findByIdAndUpdate(req.user.userId, { $set: updates }, { new: true, runValidators: true }).lean();
    if (!user) return res.status(404).json({ error: 'user_not_found' });
    return res.json({
      data: {
        id: user._id.toString(),
        displayName: user.displayName,
        primaryProfile: user.primaryProfile || 'Trader',
        defaultAnswerMode: user.primaryProfile || 'Trader',
        timezone: user.timezone || 'Europe/London',
        walletAddress: user.wallet?.publicKey || null,
        hasWallet: Boolean(user.wallet),
      },
    });
  } catch (exc) {
    return next(exc);
  }
}

export async function getAnalysisRunController(req, res, next) {
  try {
    const run = await AskAnalysisRun.findOne({
      sessionId: req.params.sessionId,
      userId: req.user.userId,
    }).sort({ startedAt: -1 }).lean();
    if (!run) return res.status(404).json({ error: 'run_not_found' });
    return res.json({ data: run });
  } catch (exc) {
    return next(exc);
  }
}