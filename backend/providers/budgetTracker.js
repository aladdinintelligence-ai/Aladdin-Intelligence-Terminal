// In-memory provider budget tracker. Counts upstream calls (and points if the
// provider response exposes a cost) per feed, per day and per month. Counters
// live in memory and are flushed to Mongo every DL_FLUSH_INTERVAL_MS and on
// shutdown, plus a crash-safe JSON snapshot on process exit so restarts do not
// reset the tally. The daily cap is derived from the monthly call budget
// (remaining / days left in the month) unless DL_DAILY_CAP overrides it.

import config from '../configs/dataLayer.js';
import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _dir = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.join(_dir, '..', '.data', 'budget-snapshot.json');

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const daysInMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

function initialState() {
  return {
    day: { key: dayKey(), calls: 0, points: 0, byFeed: {} },
    month: { key: monthKey(), calls: 0, points: 0 },
  };
}

function loadSnapshot() {
  try {
    if (fs.existsSync(SNAPSHOT_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
      const state = initialState();
      if (raw.day && raw.day.key === state.day.key) state.day = raw.day;
      if (raw.month && raw.month.key === state.month.key) state.month = raw.month;
      return state;
    }
  } catch {
    /* corrupt snapshot -> start fresh counters */
  }
  return initialState();
}

class BudgetTracker {
  constructor() {
    this.state = loadSnapshot();
    this.lastTier = 0;
    this.flushTimer = null;
    this.persistenceEnabled = false;
  }

  // Turn on JSON snapshot persistence + Mongo flush. Called by the server on
  // startup, NOT on import, so test runs never write a snapshot file.
  enablePersistence() {
    this.persistenceEnabled = true;
    this.persistJson();
  }

  start() {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flush().catch(() => {}), config.flushIntervalMs);
    this.flushTimer.unref?.();
  }

  reset() {
    this.state = initialState();
    this.lastTier = 0;
    this.persistJson();
  }

  stop() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
  }

  // Derived daily cap: override or remaining monthly calls / days left (floor to
  // never exceed the reserve on partial months).
  dailyCap() {
    if (config.dailyCapOverride > 0) return config.dailyCapOverride;
    const monthDays = daysInMonth();
    const daysLeft = Math.max(monthDays - new Date().getDate() + 1, 1);
    const remainingMonthly = Math.max(config.estimatedCallsPerMonth - this.state.month.calls, 0);
    return Math.max(Math.floor(remainingMonthly / daysLeft), 0);
  }

  usage() {
    const cap = this.dailyCap();
    return cap > 0 ? this.state.day.calls / cap : 0;
  }

  tier() {
    const u = this.bitqueryUsage();
    if (u >= config.tier3) return { id: 3, label: 'exhausted', usage: u };
    if (u >= config.tier2) return { id: 2, label: 'stale-only', usage: u };
    if (u >= config.tier1) return { id: 1, label: 'tightened', usage: u };
    return { id: 0, label: 'normal', usage: u };
  }

  // Tier usage is driven only by Bitquery calls; DexScreener is tallied for
  // calibration but never counts against the approved call budget.
  bitqueryUsage() {
    const cap = this.dailyCap();
    const bq = Object.entries(this.state.day.byFeed).reduce(function (n, [k, v]) { return k.startsWith('bitquery:') ? n + v : n; }, 0);
    return cap > 0 ? bq / cap : 0;
  }

  // Call before firing an upstream request. Returns true if budget is available
  // for this call at the current tier. Never reserves; actual counting happens
  // in addCall() only if the request really reaches the wire.
  canFire() {
    if (this.state.day.key !== dayKey()) this.rollDay();
    if (this.state.month.key !== monthKey()) this.rollMonth();
    const t = this.tier();
    if (t.id !== this.lastTier) {
      console.log(`[BUDGET] tier change ${this.lastTier} -> ${t.id} (${t.label}), daily usage ${(t.usage * 100).toFixed(1)}% cap=${this.dailyCap()} calls=${this.state.day.calls}`);
      this.lastTier = t.id;
    }
    return t.id < 3; // block all upstream at 100%
  }

  addCall(feed, points = 0, provider = 'bitquery') {
    if (this.state.day.key !== dayKey()) this.rollDay();
    if (this.state.month.key !== monthKey()) this.rollMonth();
    const key = `${provider}:${feed}`;
    this.state.day.calls += 1;
    this.state.day.points += points || 0;
    this.state.day.byFeed[key] = (this.state.day.byFeed[key] || 0) + 1;
    this.state.month.calls += 1;
    this.state.month.points += points || 0;
  }

  rollDay() {
    this.state.day = { key: dayKey(), calls: 0, points: 0, byFeed: {} };
  }

  rollMonth() {
    this.state.month = { key: monthKey(), calls: 0, points: 0 };
  }

  snapshot() {
    const t = this.tier();
    return {
      tier: t,
      daily: { key: this.state.day.key, calls: this.state.day.calls, points: this.state.day.points, byFeed: { ...this.state.day.byFeed }, cap: this.dailyCap() },
      monthly: { key: this.state.month.key, calls: this.state.month.calls, points: this.state.month.points },
    };
  }

  // Primary persistence is Mongo (datalayer_budgets collection); the JSON
  // snapshot is a local-dev / crash-only fallback. Call after the Mongo
  // connection is established to hydrate counters from Mongo first.
  async loadFromMongo() {
    if (mongoose.connection.readyState !== 1) return null;
    try {
      const col = mongoose.connection.db.collection('datalayer_budgets');
      const [dayDoc, monthDoc] = await Promise.all([
        col.findOne({ kind: 'day', name: dayKey() }),
        col.findOne({ kind: 'month', name: monthKey() }),
      ]);
      if (dayDoc || monthDoc) {
        const state = initialState();
        if (dayDoc) {
          state.day = { key: dayDoc.name, calls: dayDoc.calls || 0, points: dayDoc.points || 0, byFeed: dayDoc.byFeed || {} };
        }
        if (monthDoc) {
          state.month = { key: monthDoc.name, calls: monthDoc.calls || 0, points: monthDoc.points || 0 };
        }
        return state;
      }
    } catch {
      /* fall through to file */
    }
    return null;
  }

  // Hydrate counters at boot: Mongo primary, JSON file fallback (local dev).
  async load() {
    const fromMongo = await this.loadFromMongo();
    if (fromMongo) {
      this.state = fromMongo;
      this.lastTier = 0;
      if (this.persistenceEnabled) this.persistJson();
      return true;
    }
    const fromFile = loadSnapshot();
    if (!this.persistenceEnabled) this.state = fromFile;
    this.lastTier = 0;
    return false;
  }

  persistJson() {
    if (!this.persistenceEnabled) return;
    try {
      fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
      fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(this.state));
    } catch {
      /* best-effort crash snapshot */
    }
  }

  async flush() {
    const s = this.state;
    if (mongoose.connection.readyState !== 1) return;
    const col = mongoose.connection.db.collection('datalayer_budgets');
    const docs = [];
    if (s.day.calls > 0) {
      docs.push({
        key: `day:${s.day.key}`,
        kind: 'day',
        name: s.day.key,
        calls: s.day.calls,
        points: s.day.points,
        byFeed: s.day.byFeed,
        updatedAt: new Date(),
      });
    }
    if (s.month.calls > 0) {
      docs.push({
        key: `month:${s.month.key}`,
        kind: 'month',
        name: s.month.key,
        calls: s.month.calls,
        points: s.month.points,
        byFeed: s.day.byFeed,
        updatedAt: new Date(),
      });
    }
    for (const doc of docs) {
      await col.updateOne({ key: doc.key }, { $set: doc }, { upsert: true });
    }
    this.persistJson();
    console.log(`[BUDGET] flush: day=${s.day.calls}/${this.dailyCap()} month=${s.month.calls}/${config.estimatedCallsPerMonth} feeds=${JSON.stringify(s.day.byFeed)}`);
  }

  // Log per-feed counts for calibration against the Bitquery dashboard.
  logTotals() {
    const t = this.tier();
    console.log(`[BUDGET] tier=${t.id} (${t.label}) bitquery usage=${(t.usage * 100).toFixed(1)}% day=${this.state.day.calls}/${this.dailyCap()}`);
    const feeds = Object.entries(this.state.day.byFeed).sort((a, b) => b[1] - a[1]);
    if (feeds.length) console.log(`[BUDGET] per-feed ${JSON.stringify(Object.fromEntries(feeds))}`);
  }
}

export const budget = new BudgetTracker();

process.on('exit', () => budget.persistJson());
process.on('SIGINT', () => {
  budget.persistJson();
  process.exit(0);
});
process.on('SIGTERM', () => {
  budget.persistJson();
  process.exit(0);
});

export default budget;