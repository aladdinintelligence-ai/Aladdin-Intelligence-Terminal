// Aladdin platform knowledge base.
//
// Single source of truth for everything Ask Aladdin knows about the product
// itself: the pitch, every real page/route, the answer modes, the terms users
// ask about, the data sources behind the surfaces, and the honest limits.
//
// It is intentionally dependency-free (no axios, no db, no models) so it can be
// unit tested in isolation. The answer engine (services/aiEngine.js) imports it,
// builds the guide system prompt, and validates any page the model returns
// against PAGES so the assistant can never point at a route that does not exist.

export const PLATFORM = {
  name: 'Aladdin Intelligence',
  tagline: 'Behaviour beneath the market.',
  summary:
    'Aladdin Intelligence is an on-chain intelligence terminal for Solana. It resolves tokens, ' +
    'wallets and transactions into decision-ready evidence: what is actually moving, who is behind ' +
    'it, and what changed underneath the price. You browse curated market and intelligence boards, ' +
    'open a live per-token terminal, ask grounded questions in Ask Aladdin, and save the results as ' +
    'queries, dashboards and exports.',
  positioning:
    'Aladdin explains market behaviour with sourced evidence instead of price noise or social hype. ' +
    'Every number is tied to observed on-chain records, and every label is described as an observed ' +
    'behaviour, not a guarantee, identity or accusation.',
  audience:
    'Traders, analysts and token creators who need to understand what is happening on-chain and why, ' +
    'without giving up grounding or methodology.',
  modes: {
    Trader: 'Fast, decision-oriented answers. Surfaces the strongest signal and what changed, in the shortest useful form.',
    Analyst: 'Method, provenance and reproducibility. Explains the unit of analysis, dataset, confounders, data quality and how to reproduce the result.',
    'Token Creator': 'Focus on holder quality, attention-to-holder conversion, retention and the health of the launch after the initial spike.',
  },
  dataSources: [
    'Bitquery — primary indexed Solana on-chain trades, pools, transfers and holders.',
    'DexScreener — DEX pair, price, liquidity and search metadata.',
    'Chainstream — an alternate provider that can be selected as a fallback data source.',
    'Solana RPC (e.g. Helius) — live chain reads, balances, block and socket data.',
    'Jupiter — swap routing used by the buy flow.',
    'Aladdin internal index (MongoDB) — tokens, holders, wallet positions and behaviour identities built from the streams above.',
  ],
  concepts: {
    'Migration Specialist':
      'A wallet whose observed trading repeatedly focuses on tokens approaching or completing migration. It describes behaviour in the available records; it does not identify the owner or guarantee future performance.',
    'Smart Money (Profitable Money)':
      'Wallets explained by realised performance, repeatability and entry timing — evidence of skill, not a tip or a guarantee.',
    'First 100':
      'The first 100 buyers of a token, tracked for retention: how many early wallets are still holding versus sold.',
    'Behaviour label':
      'An observed classification of wallet behaviour (e.g. accumulating, distributing, exiting, scalping). Labels describe records, not people or intent.',
    'Formation state':
      'The current on-chain participation state of a token (how buyers, concentration and flow sit together) and the evidence behind any transition.',
    'Coordinated wallets':
      'Groups of wallets that repeatedly move together or share supply, presented as evidence of co-movement rather than an accusation.',
    'Insider / creator activity':
      'Identifiable creator, funding and early-wallet relationships, shown without unsupported claims.',
    'Bonding curve':
      'The pricing mechanism of a launch before migration. "Almost Bonded" means near graduation; "Migrated" means it graduated to a normal DEX pool.',
    'Launch lifecycle':
      'The stages Aladdin tracks for new tokens: New, Almost Bonded, Migrated and Trending.',
    'Established / OG':
      'Mature meme assets with a longer history, tracked for structural and behavioural change rather than launch dynamics.',
    'Evidence snapshot':
      'The specific, hashed set of records and the analysis period an answer was produced from, so a result can be audited and reproduced.',
    'Answer mode':
      'The lens Ask Aladdin answers through — Trader, Analyst or Token Creator.',
    'Similarity (historical match)':
      'How closely a live formation resembles observed historical outcomes. It is context, never a prediction.',
  },
  disclaimers: [
    'Aladdin does not give trading advice or buy/sell/hold/avoid verdicts; it shows evidence.',
    'Behaviour labels and similarity scores are observations about records, not statements about people, intent or the future.',
    'Some areas are not live yet: copy-trading is coming soon, credit purchasing is not yet available, and the docs and API pages are prototype documentation surfaces.',
  ],
};

// Every real route in the product. `dynamic` pages cannot be linked from a
// generic answer (they need a token/wallet/session id), so they are described
// but never emitted as clickable actions.
export const PAGES = [
  {
    id: 'home',
    name: 'Home',
    route: '/',
    category: 'Getting started',
    purpose: 'The public landing page that explains what Aladdin is and how to launch the app.',
    shows: 'product positioning, sign-in options (Google, Telegram, Solana wallet), and links to the product and the developer API',
    keywords: ['home', 'landing', 'sign in', 'sign up', 'log in', 'get started'],
  },
  {
    id: 'launches',
    name: 'Launches',
    route: '/launches',
    category: 'Market Discovery',
    purpose: 'The live market-discovery board for tracked Solana tokens.',
    shows: 'New, Almost Bonded, Migrated and Trending tokens with market cap, liquidity, 1H volume, bonding progress and search/sort/filter controls',
    keywords: ['launch', 'launches', 'new token', 'new tokens', 'bonding', 'almost bonded', 'migrated', 'trending', 'new pairs', 'discovery'],
  },
  {
    id: 'movers',
    name: 'Movers + Why',
    route: '/movers',
    category: 'Market Discovery',
    purpose: 'Explains tokens whose price moved by showing what changed underneath.',
    shows: 'mover tokens, formation state, buyer counts, market cap and % change, and a behavioural-change explanation',
    keywords: ['mover', 'movers', 'moved', 'what moved', 'pump', 'dump', 'why did', 'price change'],
  },
  {
    id: 'narratives',
    name: 'Narratives',
    route: '/narratives',
    category: 'Market Discovery',
    purpose: 'Ranks meme narratives/metas by participation quality rather than social noise.',
    shows: 'narrative names, narrative state (hot/heating/cooling), 24h volume, new launches, migrated counts, wallet flow and top tokens',
    keywords: ['narrative', 'narratives', 'meta', 'theme', 'sector', 'trend'],
  },
  {
    id: 'og',
    name: 'Established / OG',
    route: '/og',
    category: 'Market Discovery',
    purpose: 'A market-structure workspace for established, mature meme assets.',
    shows: 'established tokens with age, formation state, behavioural change, market cap, liquidity, holders and top-10 concentration',
    keywords: ['og', 'established', 'mature', 'old token', 'long lived', 'blue chip'],
  },
  {
    id: 'smart-money',
    name: 'Smart / Profitable Money',
    route: '/smart-money',
    category: 'Intelligence',
    purpose: 'Surfaces wallets with proven, repeatable performance.',
    shows: 'proven wallets with behaviour badge, realised PnL, win rate, sample tokens, entry stage, open position and repeatability',
    keywords: ['smart money', 'profitable', 'profitable money', 'profitable wallets', 'pnl', 'win rate', 'successful wallet', 'best wallets'],
  },
  {
    id: 'formation',
    name: 'Market Formation',
    route: '/formation',
    category: 'Intelligence',
    purpose: 'Shows on-chain participation states and the evidence behind each formation transition.',
    shows: 'formation tokens with buyers, top-10/top-1 concentration, buy/sell USD flow, % profitable, migration status and market detail',
    keywords: ['formation', 'market formation', 'participation', 'structure', 'concentration', 'flow'],
  },
  {
    id: 'insiders',
    name: 'Insider / Creator Activity',
    route: '/insiders',
    category: 'Intelligence',
    purpose: 'Shows identifiable creator, funding and early-wallet relationships.',
    shows: 'insider stages (accumulating/distributing/exiting), linked-supply cohort size, buyers, lead cohort wallet and entry, net USD flow and average sold %',
    keywords: ['insider', 'insiders', 'creator', 'dev', 'developer', 'team', 'early wallet', 'funding', 'bundled'],
  },
  {
    id: 'clusters',
    name: 'Coordinated Wallets',
    route: '/clusters',
    category: 'Intelligence',
    purpose: 'Surfaces repeated group behaviour as evidence, not accusation.',
    shows: 'wallet clusters with wallet/token counts, stage, shared tokens, timed co-movements, net USD flow and member wallets',
    keywords: ['cluster', 'clusters', 'coordinated', 'sybil', 'wallets moving together', 'co-movement', 'group'],
  },
  {
    id: 'historical',
    name: 'Historical Match',
    route: '/historical',
    category: 'Intelligence',
    purpose: 'Compares live formations against observed historical outcomes.',
    shows: 'formation matches with similarity %, formation type, median peak, % retained and the important differences — context, not prediction',
    keywords: ['historical', 'history', 'match', 'similarity', 'past', 'before', 'compare historically'],
  },
  {
    id: 'watchlist',
    name: 'Watchlist',
    route: '/watchlist',
    category: 'Personal',
    purpose: 'The signed-in list of tokens the user is tracking.',
    shows: 'saved tokens with price, 24h change, market cap, volume and DEX, newest first (up to 100)',
    keywords: ['watchlist', 'saved', 'saved tokens', 'favourite', 'favorite', 'track', 'star'],
  },
  {
    id: 'alerts',
    name: 'Alerts',
    route: '/alerts',
    category: 'Personal',
    purpose: 'A high-signal behavioural event feed linked to evidence.',
    shows: 'alert type, symbol, detail, 24h % change, market cap, USD moved and time, each linking to the token and to Ask Aladdin',
    keywords: ['alert', 'alerts', 'signal', 'notify', 'notification', 'event feed'],
  },
  {
    id: 'ask-aladdin',
    name: 'Ask Aladdin',
    route: '/ask-aladdin',
    category: 'Intelligence',
    purpose: 'The natural-language reasoning workspace over tokens, wallets and market activity.',
    shows: 'investigations, conversation turns, attached token/wallet context, structured result tables, generated follow-ups, saved queries and CSV/JSON export',
    keywords: ['ask', 'ask aladdin', 'question', 'ai', 'chat', 'investigate', 'analysis workspace', 'reasoning'],
  },
  {
    id: 'terminal',
    name: 'Live Terminal',
    route: '/live/:id',
    dynamic: true,
    category: 'Token detail',
    purpose: 'The per-token terminal opened from any token row or card.',
    shows: 'token hero metrics, an embedded DexScreener chart, and tabs for Transactions, Participants, Most Profitable, Largest Holders, First 100, Holders, Live State and Historical Match',
    keywords: ['terminal', 'token page', 'chart', 'holders', 'participants', 'first 100', 'largest holders', 'transactions', 'live state'],
  },
  {
    id: 'token',
    name: 'Token (redirect)',
    route: '/token/:id',
    dynamic: true,
    category: 'Token detail',
    purpose: 'Compatibility route that redirects to the live terminal.',
    shows: 'nothing of its own — it redirects to /live/[id]',
    keywords: [],
  },
  {
    id: 'wallet',
    name: 'Wallet (redirect)',
    route: '/wallet/:id',
    dynamic: true,
    category: 'Token detail',
    purpose: 'Compatibility route that opens a wallet as Ask Aladdin context.',
    shows: 'nothing of its own — it redirects to Ask Aladdin with the wallet attached',
    keywords: ['wallet', 'wallet page', 'wallet detail'],
  },
  {
    id: 'queries',
    name: 'Saved Queries',
    route: '/queries',
    category: 'Workspace',
    purpose: 'The workspace index of structured requests you have saved.',
    shows: 'saved queries with title, definition, result count and last run',
    keywords: ['query', 'queries', 'saved queries', 'saved search', 'saved result'],
  },
  {
    id: 'dashboards',
    name: 'Dashboards',
    route: '/dashboards',
    category: 'Workspace',
    purpose: 'The workspace index of dashboards built from saved queries.',
    shows: 'dashboards with panel count, visibility and refresh label',
    keywords: ['dashboard', 'dashboards', 'panel', 'board'],
  },
  {
    id: 'copy-traders',
    name: 'Copy Smart Traders',
    route: '/copy-traders',
    category: 'Workspace',
    purpose: 'A coming-soon page for copying smart traders (execution is not enabled).',
    shows: 'a coming-soon notice; it points users to Smart Money for evidence',
    keywords: ['copy', 'copy trading', 'copy traders', 'autotrade', 'mirror'],
  },
  {
    id: 'exports',
    name: 'Exports',
    route: '/exports',
    category: 'Workspace',
    purpose: 'The list of structured data exports you have produced.',
    shows: 'export records with filename, format, row/column counts and placeholder billing metadata',
    keywords: ['export', 'exports', 'download', 'csv', 'json', 'data out'],
  },
  {
    id: 'credits',
    name: 'Buy Aladdin Credits',
    route: '/credits',
    category: 'Account',
    purpose: 'Explains Aladdin credits (product usage units, not wallet assets).',
    shows: 'the current credit balance and a notice that purchasing is not yet available',
    keywords: ['credit', 'credits', 'billing', 'usage', 'payment'],
  },
  {
    id: 'settings',
    name: 'Settings',
    route: '/settings',
    category: 'Account',
    purpose: 'Account and terminal preferences.',
    shows: 'profile, appearance & language, account & security, intelligence toggles, integrations, plan, and help links (?section= selects a section)',
    keywords: ['settings', 'preferences', 'profile', 'account', 'appearance', 'language', 'timezone', 'theme', 'security', 'billing'],
  },
  {
    id: 'docs',
    name: 'Aladdin Docs',
    route: '/docs',
    category: 'Account',
    purpose: 'A product-guide surface (currently a placeholder topic list).',
    shows: 'a list of documentation topic titles — content is not written yet',
    keywords: ['docs', 'documentation', 'guide', 'manual', 'tutorial', 'help topics'],
  },
  {
    id: 'api',
    name: 'Aladdin API',
    route: '/api',
    category: 'Account',
    purpose: 'Prototype developer documentation for the Aladdin and Ask Aladdin APIs.',
    shows: 'static capability lists for the Aladdin API and the Ask Aladdin API — prototype only, no keys issued',
    keywords: ['api', 'developer', 'developers', 'programmatic', 'integration', 'endpoint'],
  },
];

const PAGE_BY_ID = new Map(PAGES.map((page) => [page.id, page]));

// Concept terms that, when combined with a definition-style prefix, mark a
// question as being about the platform rather than a data request.
const CONCEPT_TERMS = [
  ...Object.keys(PLATFORM.concepts).map((term) => term.toLowerCase()),
  'launches',
  'watchlist',
  'alerts',
  'dashboards',
  'saved queries',
  'exports',
  'credits',
  'smart money',
  'market formation',
  'coordinated wallets',
  'historical match',
  'movers',
  'narratives',
  'bonding',
  'founder',
  'dev wallet',
];

const CONCEPT_PREFIX_RE = /^(what|explain|define|describe|tell me about|meaning of|whats|what's)\b/i;
const DATAISH_RE = /\b(show|list|which|how many|top|rank|compare|holding|holds|bought|sold|buyers|count|trending)\b/i;
const PLATFORM_PHRASE_RE = /\b(aladdin|this (platform|site|app|website|product|tool)|the (platform|site|app|website|product|tool))\b/i;
const HOW_TO_RE = /\b(how (do|does|can) (i|you)|how to|where (do|can) (i|find|see|check)|where is|which page|what page|point me|take me to|navigate to|getting started|what can you do|what do you do|who are you)\b/i;

export function detectPlatformIntent(question) {
  const raw = String(question || '').trim();
  if (!raw) return { matched: false };
  const lower = raw.toLowerCase();
  if (/^(help|getting started)$/i.test(raw)) return { matched: true };
  if (PLATFORM_PHRASE_RE.test(lower)) return { matched: true };
  if (HOW_TO_RE.test(lower)) return { matched: true };
  if (CONCEPT_PREFIX_RE.test(raw) && raw.split(/\s+/).length <= 9 && !DATAISH_RE.test(lower)) {
    const term = CONCEPT_TERMS.find((candidate) => lower.includes(candidate));
    if (term) return { matched: true, topic: term };
  }
  return { matched: false };
}

export function selectPages(question, limit = 3) {
  const lower = String(question || '').toLowerCase();
  const scores = new Map();
  for (const page of PAGES) {
    if (!page.keywords || !page.keywords.length) continue;
    let score = 0;
    for (const keyword of page.keywords) {
      if (lower.includes(keyword)) score += keyword.includes(' ') ? 2 : 1;
    }
    if (score > 0) scores.set(page.id, score);
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .slice(0, limit);
}

export function sanitizePageIds(ids, limit = 3) {
  if (!Array.isArray(ids)) return [];
  const out = [];
  for (const raw of ids) {
    const id = String(raw || '').trim().toLowerCase();
    if (PAGE_BY_ID.has(id) && !out.includes(id)) out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

export function pagesFromIds(ids) {
  return (Array.isArray(ids) ? ids : [])
    .map((id) => PAGE_BY_ID.get(String(id || '').trim().toLowerCase()))
    .filter(Boolean);
}

export function toPageActions(ids, limit = 3) {
  if (!Array.isArray(ids)) return [];
  const actions = [];
  const seen = new Set();
  for (const raw of ids) {
    const page = PAGE_BY_ID.get(String(raw || '').trim().toLowerCase());
    if (!page || page.dynamic || !page.route || seen.has(page.route)) continue;
    seen.add(page.route);
    actions.push({ label: `Open ${page.name}`, route: page.route });
    if (actions.length >= limit) break;
  }
  return actions;
}

export function platformFallbackAnswer(question, matchedIds = []) {
  const ids = matchedIds.length ? matchedIds : selectPages(question);
  const pages = pagesFromIds(sanitizePageIds(ids));
  const where = pages.length
    ? ` You can start on ${pages.map((page) => `${page.name} (${page.route})`).join(', ')}.`
    : ' Ask me where to find a specific surface and I will point you to it.';
  return `${PLATFORM.summary}${where}`;
}

function pageCatalog() {
  return PAGES.filter((page) => page.route).map((page) => {
    const route = page.dynamic ? `${page.route} (opened with a token/wallet id)` : page.route;
    return `- ${page.name} [${page.id}] — ${route}\n    What it is: ${page.purpose}\n    What it shows: ${page.shows}`;
  }).join('\n');
}

export function buildPlatformSystemPrompt() {
  const modes = Object.entries(PLATFORM.modes)
    .map(([name, description]) => `- ${name}: ${description}`)
    .join('\n');
  const concepts = Object.entries(PLATFORM.concepts)
    .map(([term, definition]) => `- ${term}: ${definition}`)
    .join('\n');
  return [
    'You are Aladdin, the in-product guide for the Aladdin Intelligence platform.',
    'You explain what the platform is and does, how to use it, what each page shows, and where to find a given surface or dataset.',
    'You answer in plain, confident English (2-6 sentences). Be complete but never padded.',
    '',
    `PLATFORM OVERVIEW`,
    PLATFORM.summary,
    `Positioning: ${PLATFORM.positioning}`,
    `Who it is for: ${PLATFORM.audience}`,
    '',
    'ANSWER MODES',
    modes,
    '',
    'PAGES (use ONLY these; never invent a page or route)',
    pageCatalog(),
    '',
    'KEY TERMS',
    concepts,
    '',
    'DATA SOURCES BEHIND THE PLATFORM',
    PLATFORM.dataSources.map((source) => `- ${source}`).join('\n'),
    '',
    'RULES',
    '- Only reference pages that appear in the PAGES list above. Cite them as "Name (/route)".',
    '- When the user asks where to find something, name the exact page and route, and choose the most relevant page ids.',
    '- Never give trading advice, price predictions, or buy/sell/hold/avoid verdicts.',
    '- Describe behaviour labels and similarity scores as observations about records, not facts about people or the future.',
    '- Be honest about what is not live yet (copy-trading is coming soon; credit purchasing is unavailable; docs and API pages are prototypes).',
    '- If the question is really a data question about a specific token or wallet, say which page holds that data and invite them to ask it here directly.',
    '- Choose at most 3 page ids, in order of usefulness, from the ids shown in square brackets.',
    '',
    'Return JSON only, with this exact shape:',
    '{"answer": string, "pages": string[], "follow_ups": string[]}',
  ].join('\n');
}

export const PLATFORM_PAGE_IDS = PAGES.map((page) => page.id);
