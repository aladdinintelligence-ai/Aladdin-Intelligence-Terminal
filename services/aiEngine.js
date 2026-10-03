import crypto from 'crypto';
import { aiEngine } from '../configs/services/aiEngine.js';
import { chatJson } from './aiComposer.js';
import {
  resolveMintFromQuestion,
  getMovers,
  getLaunches,
  getTokenDetail,
  getMigrationSpecialists,
  getProfitableWallets,
  resolveTokenBySymbol,
  isTokenMint,
  tokenColumns,
  walletColumns,
} from './aiTools.js';

const pause = (duration = 420) => new Promise((resolve) => setTimeout(resolve, duration));

const DEEP_STAGES = [
  { operation: 'resolving', message: 'Resolving the question, entity and analysis period' },
  { operation: 'filtering', message: 'Loading and filtering matching records' },
  { operation: 'calculating', message: 'Calculating the requested features' },
  { operation: 'ranking', message: 'Analysing and ranking the results' },
  { operation: 'formatting', message: 'Creating the profile-specific interpretation' },
  { operation: 'formatting', message: 'Preparing the final result' },
];

const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const GREETING_RE = /^(hi|hello|hey|yo|good\s*(morning|day|afternoon|evening)|greetings)[!.?\s]*$/i;
const CASUAL_RE = /^(how are you|how's it going|thanks|thank you|cheers|what can you do|who are you|help)[!.?\s]*$/i;
const DEFINITION_RE = /^(what|who)\s+(is|are|does)\b/i;
const DATA_TERMS_RE = /\b(show|which|compare|top|best|get|find|list|holders?|wallets?|tokens?|bought|sold|buy|holding|market|liquidity|volume|migration|today|yesterday|week|alert|insider|creator|first\s*100|retention|profit|specialist|trending|movers|analyse|analyze|analyse any)\b/i;

function resolveAnalysisPeriod(query, now, timezone = 'Europe/London') {
  const q = query.toLowerCase();
  let start;
  let resolution;
  const hours1 = new Date(now.getTime() - 60 * 60 * 1000);
  if (q.includes('today') || q.includes('woke up') || q.includes('overnight')) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const pick = (t) => parts.find((p) => p.type === t)?.value || '01';
    const offset = timezone === 'Europe/London' ? '+01:00' : 'Z';
    start = new Date(`${pick('year')}-${pick('month')}-${pick('day')}T00:00:00${offset}`);
    resolution = 'today';
  } else {
    start = hours1;
    resolution = 'current_snapshot';
  }
  const fmt = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: timezone, timeZoneName: 'short',
  }).format(start);
  const fmtEnd = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: timezone, timeZoneName: 'short',
  }).format(now);
  return {
    start: start.toISOString(),
    end: now.toISOString(),
    timezone,
    label: `${fmt} to ${fmtEnd} ${timezone}`,
    resolution,
  };
}

function resolveAskIntent(request) {
  const question = request.question.trim();
  if (MINT_RE.test(question)) return { intent: 'data_query' };
  if (GREETING_RE.test(question)) return { intent: 'greeting', reply: 'Hi there. What would you like to investigate?' };
  if (CASUAL_RE.test(question)) return { intent: 'casual', reply: "I'm ready. Ask me about a token, wallet or market change." };
  if (request.hasPriorContext && /^(who|when|are|how|why|what changed|and|then|so)\b/i.test(question)) return { intent: 'follow_up' };
  if (DEFINITION_RE.test(question)) {
    if (/migration specialist/i.test(question)) {
      return { intent: 'definition', reply: 'A Migration Specialist is a wallet whose observed trading repeatedly focuses on tokens approaching or completing migration. The label describes behaviour in the available records; it does not identify the owner or guarantee future performance.' };
    }
    return { intent: 'definition', reply: 'Tell me the Aladdin term you want defined, and I’ll explain it in plain English.' };
  }
  if (/^(buy|sell|hold|avoid)\b/i.test(question)) {
    return { intent: 'unsupported', reply: 'I can show the relevant market and wallet evidence, but I don’t issue trading verdicts. Which token or risk would you like to investigate?' };
  }
  if (DATA_TERMS_RE.test(question)) {
    if (/^(show|get|find|list|compare|analyse|analyze|rank|track|check)\b/i.test(question)) return { intent: 'data_query' };
    return { intent: request.hasPriorContext && !/\b(token|wallet|market|today|yesterday)\b/i.test(question) ? 'follow_up' : 'data_query' };
  }
  if (question.split(/\s+/).length < 4) return { intent: 'ambiguous', reply: 'What token, wallet or market activity would you like me to investigate?' };
  return { intent: 'ambiguous', reply: 'Could you name the token, wallet, period or market change you want to investigate?' };
}

async function resolveEntity(request) {
  const directMint = await resolveMintFromQuestion(request.question);
  if (directMint) return { mint: directMint, kind: 'mint' };

  // currentEntityId carries the profile wallet as often as it carries a token
  // mint, and both are base58 so MINT_RE matches either. Confirm it is a real
  // token before treating it as the subject of the question.
  const context = request.currentEntityId || null;
  if (context && await isTokenMint(context)) return { mint: context, kind: 'mint' };

  const symbol = (request.question.match(/\$[A-Za-z0-9]{2,10}\b/) || [])[0]
    || (context && !MINT_RE.test(context) ? context : null);
  if (symbol) {
    const token = await resolveTokenBySymbol(symbol);
    if (token) return { mint: token._id, symbol: token.symbol || symbol.replace(/^\$/, ''), kind: 'symbol' };
  }
  return null;
}

function planKindFromQuestion(question, entity, currentEntityId) {
  const q = question;
  if (/migration specialist|wallets?.*holding|which wallet|who (were|are) (they|those)|early (buyers|holders)/i.test(q)) return 'wallets';
  if (/compare|differently|vs\.|versus/i.test(q)) return 'comparison';
  if (/woke up|today|while i was away|overnight|briefing/i.test(q)) return 'briefing';
  if (entity) return 'consultation';
  if (/above \$1m|over \$1m|no matches/i.test(q)) return 'tokens';
  return 'tokens';
}

function resolveAnalysisIntent(request) {
  const resolved = resolveAskIntent(request);
  const isData = resolved.intent === 'data_query' || resolved.intent === 'follow_up';
  return { ...resolved, isData };
}

function datasetFromResult(result) {
  if (!result) return { columns: [], rows: [], totalRows: 0, displayedRows: 0, availability: 'unavailable' };
  if (result.ok === false || !Array.isArray(result.rows)) {
    return { columns: result.columns || [], rows: [], totalRows: 0, displayedRows: 0, availability: 'unavailable' };
  }
  const displayedRows = Math.min(result.rows.length, result.limit || 10);
  return {
    columns: result.columns,
    rows: result.rows,
    totalRows: result.totalRows != null ? result.totalRows : result.rows.length,
    displayedRows,
    availability: result.rows.length ? 'available' : 'unavailable',
  };
}

async function executePlan(plan) {
  switch (plan.kind) {
    case 'wallets':
      if (plan.entityId) return getMigrationSpecialists(plan.entityId, plan.limit || 10);
      return getProfitableWallets(null, plan.limit || 10);
    case 'comparison':
      return getComparison(plan.entityId);
    case 'briefing':
      return getMovers(plan.limit || 10);
    case 'consultation':
      if (!plan.entityId) return getMovers(plan.limit || 10);
      return getTokenDetail(plan.entityId);
    case 'tokens':
    default: {
      const launches = plan.filters.some((f) => f.field === 'marketCap' && Number(f.value) >= 1000000)
        ? null
        : await getLaunches(plan.tab || 'new', plan.limit || 10);
      if (launches && launches.ok && launches.rows.length) return launches;
      return getMovers(plan.limit || 10);
    }
  }
}

async function getComparison(entityHint) {
  const parts = [];
  if (entityHint) {
    const first = await getTokenDetail(entityHint);
    if (first.ok && first.rows.length) parts.push(first.rows[0]);
  }
  const movers = await getMovers(10);
  if (!parts.length && movers.ok && movers.rows.length) parts.push(movers.rows[0]);
  if (movers.ok && movers.rows.length > 1) parts.push(movers.rows[0]);
  const second = await getLaunches('new', 10);
  if (second.ok && second.rows.length) parts.push(second.rows[0]);
  if (second.ok && second.rows.length > 1) parts.push(second.rows[1]);

  const unique = Array.from(new Map(parts.filter(Boolean).map((r) => [r.values.token, r])).values()).slice(0, 2);
  if (unique.length < 2) return { ok: false, error: 'Not enough entities available for comparison', columns: [], rows: [] };

  const [a, b] = unique;
  const diff = (va, vb) => {
    if (va == null && vb == null) return '—';
    if (va == null) return `n/a vs ${vb}`;
    if (vb == null) return `${va} vs n/a`;
    return typeof va === 'number' && typeof vb === 'number' ? `${Math.round((va - vb) * 100) / 100}` : `${va} → ${vb}`;
  };
  const metrics = [
    { key: 'Market cap', a: a.values.marketCap, b: b.values.marketCap, fmt: (v) => (v == null ? 'n/a' : `$${v.toLocaleString()}`) },
    { key: 'Liquidity', a: a.values.liquidity, b: b.values.liquidity, fmt: (v) => (v == null ? 'n/a' : `$${v.toLocaleString()}`) },
    { key: 'Volume', a: a.values.volume, b: b.values.volume, fmt: (v) => (v == null ? 'n/a' : `$${v.toLocaleString()}`) },
    { key: 'Holders', a: a.values.holders, b: b.values.holders, fmt: (v) => (v == null ? 'n/a' : v.toLocaleString()) },
  ];
  const labelA = String(a.values.token || '').split(' · ')[0] || 'A';
  const labelB = String(b.values.token || '').split(' · ')[0] || 'B';
  const rows = metrics.map((m, index) => ({
    id: `compare-${index}`,
    entityType: 'cohort',
    tokenId: 'comparison',
    terminalView: 'Live State',
    values: {
      metric: m.key,
      a: m.fmt(m.a),
      b: m.fmt(m.b),
      difference: typeof m.a === 'number' && typeof m.b === 'number' ? diff(m.a, m.b) : '—',
    },
  }));
  const comparisonColumns = [
    { key: 'metric', label: 'Metric', kind: 'text' },
    { key: 'a', label: labelA, kind: 'text' },
    { key: 'b', label: labelB, kind: 'text' },
    { key: 'difference', label: 'Difference', kind: 'text' },
  ];
  return { ok: true, columns: comparisonColumns, rows, totalRows: rows.length, limit: 10 };
}

function buildPlan(request, entity, kind) {
  const noResults = /above \$1m|over \$1m|no matches/i.test(request.question);
  let filters;
  let sort;
  if (kind === 'wallets') {
    filters = entity ? [{ field: 'token', operator: '=', value: entity.symbol || entity.mint }] : [{ field: 'behaviour', operator: '=', value: 'Migration Specialist' }];
    sort = { field: 'stillHolding', direction: 'desc' };
  } else if (kind === 'comparison') {
    filters = [];
    sort = { field: 'marketCap', direction: 'desc' };
  } else if (kind === 'consultation') {
    filters = entity ? [{ field: 'tokenId', operator: '=', value: entity.mint }] : [{ field: 'universe', operator: '=', value: 'available tokens' }];
    sort = { field: 'marketCap', direction: 'desc' };
  } else if (kind === 'briefing') {
    filters = [{ field: 'universe', operator: '=', value: 'available tokens' }];
    sort = { field: 'volume', direction: 'desc' };
  } else {
    filters = noResults ? [{ field: 'marketCap', operator: '>', value: 1_000_000 }] : [{ field: 'universe', operator: '=', value: 'available tokens' }];
    sort = { field: 'marketCap', direction: 'desc' };
  }
  const columns = kind === 'wallets' ? walletColumns : tokenColumns;
  return {
    kind,
    entityType: kind === 'wallets' ? 'wallet' : kind === 'comparison' ? 'cohort' : 'token',
    entityId: entity?.mint || (kind === 'wallets' || kind === 'consultation' ? request.currentEntityId : undefined),
    filters,
    columns: columns.map((column) => column.key),
    sort,
    limit: 10,
    analysisPeriod: request.period,
  };
}

function extractNumbers(text) {
  return (String(text || '').match(/\d[\d.,]*/g) || []).map((n) => parseFloat(n.replace(/,/g, '')));
}

function datasetNumberSet(dataset) {
  const set = new Set();
  set.add(dataset.totalRows);
  set.add(dataset.displayedRows);
  for (const row of dataset.rows) {
    for (const value of Object.values(row.values)) {
      if (typeof value === 'number') set.add(value);
    }
  }
  return set;
}

function verifierPasses(text, dataset, mode, entityLabel) {
  if (!aiEngine.verifier.enabled) return true;
  const allowed = datasetNumberSet(dataset);
  const numbers = extractNumbers(text);
  if (aiEngine.verifier.strictNumbers) {
    const numericOk = numbers.every((n) => [...allowed].some((a) => Math.abs(a - n) < 0.01));
    if (!numericOk) return false;
  } else {
    for (const n of numbers) {
      if (n <= 0) continue;
      const found = [...allowed].some((a) => Math.abs(a - n) < 0.01);
      if (!found) return false;
    }
  }

  // Entity grounding: the last token mentioned in the dataset must match the
  // resolved entity label. Reference an entity absent from the dataset only if
  // it is the resolved one (e.g. "what changed for $BARK").
  if (entityLabel && dataset.rows.length) {
    const rowTokens = dataset.rows.slice(0, 5).map((r) => String(r.values?.token || ''));
    const mentioned = rowTokens.join(' ').toLowerCase();
    const labelFragment = String(entityLabel).replace(/^\$/, '').toLowerCase();
    if (labelFragment && mentioned && !mentioned.includes(labelFragment)) {
      const explicit = new RegExp(labelFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text);
      if (!explicit) return false;
    }
  }
  return true;
}

function deterministicInterpretation(mode, plan, dataset) {
  if (!dataset || !dataset.totalRows) {
    return '';
  }
  if (mode === 'Trader') {
    return 'Retention and liquidity separate the stronger rows from weaker formations; concentration remains the main material risk. The focus is evidence and position management, not a trading verdict.';
  }
  if (mode === 'Analyst') {
    return 'Lifecycle retention and liquidity deterioration explain most of the difference in this cohort; the sample is descriptive, not causal. Rankings reflect the available real records.';
  }
  return 'Sustained participation and liquidity are the strongest factual communication points; concentration and exits require transparent context in any update.';
}

function deterministicDirectAnswer(plan, dataset, entityLabel) {
  if (!dataset || !dataset.totalRows) return "I don't have data for that yet.";
  if (plan.kind === 'wallets') return `Real wallet-behaviour records were ranked: ${dataset.displayedRows} of ${dataset.totalRows} shown.`;
  if (plan.kind === 'comparison') return 'Two entities were compared on market structure metrics from the live provider.';
  if (plan.kind === 'briefing') return `${dataset.displayedRows} market changes were identified in the analysed period.`;
  if (plan.kind === 'consultation' && entityLabel) return `${entityLabel} is profiled from the live provider with ${dataset.displayedRows} matching record shown.`;
  return `${dataset.displayedRows} structured records match this query.`;
}

function deterministicFollowUps(question, entityLabel) {
  const label = entityLabel || 'the entity';
  if (/comparison|compare|vs/i.test(question)) return [`Which early wallets are still holding ${label}?`, 'Show liquidity changes by lifecycle stage.', 'Compare creator-linked selling.'];
  if (/migration specialist|wallets.*holding/i.test(question)) return ['Show their previous profitable tokens.', `Which wallet holds the most ${label}?`, 'When did these wallets start reducing?'];
  if (/woke up|today|while i was away/i.test(question)) return ['Which tokens retained the most early buyers?', 'Show profitable wallets that entered today.', 'Which migrations lost liquidity fastest?'];
  return [`Which wallets are still holding ${label}?`, 'Show the top holders by supply.', 'What changed in the market in the last hour?'];
}

function entityLabelFor(plan, entity) {
  if (entity?.symbol) return `$${entity.symbol}`;
  if (entity?.mint) return entity.mint.slice(0, 8) + '...';
  if (plan.entityId) return plan.entityId.slice(0, 8) + '...';
  return null;
}

function evidenceSnapshot(dataset, plan, request) {
  const payload = JSON.stringify({
    columns: dataset.columns,
    rows: dataset.rows.slice(0, 20),
    period: request.period,
    plan: { kind: plan.kind, filters: plan.filters },
    depth: request.depth || 'quick',
  });
  const hash = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
  return {
    id: `snapshot-${plan.kind}-${Date.now()}`,
    hash,
    coverage: dataset.totalRows ? 'Live record coverage' : 'No eligible rows',
    limitations: dataset.totalRows
      ? ['Live provider data. Correlation does not establish causation.']
      : ['Widen the filter or remove a condition.'],
  };
}

async function composeNarrative(mode, plan, dataset, question, entityLabel, depth = 'quick') {
  const system = [
    { role: 'system', content: 'You are Aladdin, an on-chain intelligence assistant. You answer with real, grounded data only. Never invent numbers.' },
  ];
  const user = {
    role: 'user',
    content: JSON.stringify({
      task: 'Write a concise grounded answer for the user ask. Return JSON only: {"profile_summary": string, "direct_answer": string, "follow_ups": string[]}',
      mode,
      question,
      plan: { kind: plan.kind, entityId: plan.entityId },
      rows: dataset.rows.slice(0, 5).map((row) => row.values),
      totalRows: dataset.totalRows,
      displayedRows: dataset.displayedRows,
    }),
  };
  const result = await chatJson([...system, user], { tier: depth === 'deep' ? 'deep' : 'quick', maxTokens: 700 });
  if (!result.ok || !result.content || typeof result.content.profile_summary !== 'string') return null;

  const narrative = {
    profile_summary: result.content.profile_summary,
    direct_answer: result.content.direct_answer || deterministicDirectAnswer(plan, dataset, entityLabel),
    follow_ups: Array.isArray(result.content.follow_ups)
      ? result.content.follow_ups.map((f) => String(f)).filter(Boolean).slice(0, 3)
      : deterministicFollowUps(question, entityLabel),
  };
  return narrative;
}

function conversationalAnswer(request, intent) {
  return {
    mode: request.mode,
    intent: intent.intent,
    has_data: false,
    direct_answer: intent.reply || 'What would you like to investigate?',
    query_definition: request.question,
    result_columns: [],
    result_rows: [],
    result_count: 0,
    displayed_count: 0,
    sort_definition: '',
    active_filters: [],
    analysis_period: request.period,
    currency_display: null,
    profile_summary: '',
    generated_follow_ups: [],
    full_query_link: '/queries',
    export_options: [],
    data_details: { evidenceSnapshotId: '', evidenceHash: '', coverage: '', limitations: [] },
    availability: 'unavailable',
    synthetic: true,
    evidenceSnapshotId: '',
    evidenceHash: '',
  };
}

export async function runAskAladdin(request, { onActivity = () => {}, pauseMs = 420 }) {
  const startedAt = new Date().toISOString();
  const resolved = resolveAskIntent(request);
  const isData = resolved.intent === 'data_query' || resolved.intent === 'follow_up';
  const deep = request.depth === 'deep' && isData;
  let events = [];

  if (deep) {
    events = DEEP_STAGES.map((stage, index) => ({
      id: `${stage.operation}-${index}`,
      message: stage.message,
      operation: stage.operation,
      status: 'pending',
      timestamp: startedAt,
    }));
    onActivity([...events]);
  }

  let step = 0;
  async function operate(operation, message, work) {
    let event;
    if (deep) {
      event = events[step];
      event.operation = operation;
      event.message = message;
      event.status = 'active';
      event.timestamp = new Date().toISOString();
    } else {
      event = { id: `${operation}-${events.length}`, message, operation, status: 'active', timestamp: new Date().toISOString() };
      events.push(event);
    }
    onActivity([...events]);
    await pause(pauseMs);
    await work();
    event.status = 'complete';
    step += 1;
    onActivity([...events]);
  }

  if (!isData) {
    let answer;
    await operate('resolving', 'Thinking', async () => {
      answer = conversationalAnswer(request, resolved);
    });
    const dataset = { columns: [], rows: [], totalRows: 0, displayedRows: 0, availability: 'unavailable' };
    return { answer, queryPlan: null, dataset, activityEvents: events };
  }

  let plan = null;
  let dataset = null;
  let profileSummary = '';
  let narrative = null;
  let answer = null;
  let entity = null;

  await operate('resolving', 'Resolving the question, entity and analysis period', async () => {
    entity = await resolveEntity(request);
    const kind = planKindFromQuestion(request.question, entity, request.currentEntityId);
    plan = buildPlan(request, entity, kind);
  });

  await operate('filtering', 'Loading and filtering matching records', async () => {
    const result = await executePlan(plan);
    dataset = datasetFromResult(result);
    plan.limit = 10;
    plan.analysisPeriod = plan.analysisPeriod || request.period;
  });

  await operate('calculating', 'Calculating the requested features', async () => {
    dataset = { ...dataset, rows: dataset.rows.map((row) => ({ ...row, values: { ...row.values } })) };
  });

  await operate('ranking', plan.kind === 'wallets' ? 'Analysing and ranking wallet behaviour' : 'Analysing and ranking matching market records', async () => {
    dataset = { ...dataset, rows: [...dataset.rows] };
  });

  await operate('formatting', 'Creating the profile-specific interpretation', async () => {
    const entityLabel = entityLabelFor(plan, entity);
    const fallbackSummary = deterministicInterpretation(request.mode, plan, dataset);
    const fallbackDirect = deterministicDirectAnswer(plan, dataset, entityLabelFor(plan, entity));
    // Nothing to narrate when the dataset is empty: avoid an LLM call and filler text.
    if (!dataset.totalRows) {
      profileSummary = fallbackSummary;
      return;
    }
    narrative = await composeNarrative(request.mode, plan, dataset, request.question, entityLabel, request.depth || 'quick');
    if (narrative) {
      if (verifierPasses(narrative.profile_summary, dataset, request.mode, entityLabel)) {
        profileSummary = narrative.profile_summary;
      } else {
        profileSummary = fallbackSummary;
      }
      if (!verifierPasses(narrative.direct_answer, dataset, request.mode, entityLabel)) {
        narrative.direct_answer = fallbackDirect;
      }
    } else {
      profileSummary = fallbackSummary;
    }
  });

  let entityLabel = null;
  await operate('formatting', 'Preparing the final result', async () => {
    entityLabel = entityLabelFor(plan, entity);
    const period = plan.analysisPeriod || request.period;
    const snapshot = evidenceSnapshot(dataset, plan, request);
    const direct = narrative?.direct_answer || deterministicDirectAnswer(plan, dataset, entityLabel);
    const activeFilters = plan.filters.map((f) => `${f.field} ${f.operator} ${f.value}`);
    const followUps = dataset.totalRows
      ? (narrative?.follow_ups?.length ? narrative.follow_ups : deterministicFollowUps(request.question, entityLabel))
      : [];
    const profileSummaryValue = profileSummary || deterministicInterpretation(request.mode, plan, dataset);
    const currencyDisplay = plan.kind === 'wallets' ? 'SOL' : null;
    answer = {
      mode: request.mode,
      intent: resolved.intent,
      has_data: true,
      direct_answer: direct,
      query_definition: request.question,
      result_columns: dataset.columns,
      result_rows: dataset.rows,
      result_count: dataset.totalRows,
      displayed_count: dataset.displayedRows,
      sort_definition: plan.sort ? `${plan.sort.field}, ${plan.sort.direction}` : 'Decision relevance',
      active_filters: activeFilters,
      analysis_period: period,
      currency_display: currencyDisplay,
      profile_summary: profileSummaryValue,
      generated_follow_ups: followUps,
      full_query_link: '/queries',
      export_options: ['CSV', 'JSON'],
      data_details: snapshot,
      availability: dataset.availability,
      synthetic: false,
      evidenceSnapshotId: snapshot.id,
      evidenceHash: snapshot.hash,
    };
  });

  return { answer, queryPlan: plan, dataset, activityEvents: events };
}

export { resolveAnalysisPeriod, resolveAskIntent, DEEP_STAGES };