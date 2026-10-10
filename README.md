# Aladdin Intelligence — Server

> **Behaviour beneath the market.**

Backend for Aladdin Intelligence, an on-chain intelligence terminal for Solana.
This service resolves tokens, wallets and transactions into decision-ready
evidence: it ingests on-chain data from market and indexing providers, builds a
behavioural index in MongoDB, serves the frontend's boards and token terminals,
and powers **Ask Aladdin** — a grounded, LLM-assisted reasoning workspace.

- **Stack:** Node.js (ESM) · Express 5 · MongoDB (Mongoose) · Solana Web3
- **Default port:** `5000`
- **Frontend:** separate repository (`aladdin`); this service has no HTML.

---

## Table of contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Boot sequence](#boot-sequence)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Architecture](#architecture)
- [Data providers & integrations](#data-providers--integrations)
- [The LLM layer (Ask Aladdin)](#the-llm-layer-ask-aladdin)
- [HTTP API reference](#http-api-reference)
- [Data model (MongoDB)](#data-model-mongodb)
- [Workers](#workers)
- [Testing](#testing)
- [Security notes](#security-notes)
- [Known limits](#known-limits)

---

## Requirements

- **Node.js 20+**
- **npm**
- **MongoDB** reachable via `DB_URI` (local `mongodb://localhost:27017/aladdin-db`
  is fine for development)
- Provider credentials (see [Data providers](#data-providers--integrations)).
  Bitquery is the primary data provider; a Solana RPC is needed for live reads.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create .env with at least the four required vars (see below).
#    The server exits immediately if any required var is missing.

# 3. Start MongoDB, then run the dev server (nodemon, auto-restart on edit)
npm run dev
# → [SERVER] Aladdin Node Server running on port 5000
```

Verify it is up:

```bash
curl http://localhost:5000/
# {"status":"ok","service":"aladdin-node-server","database_backend":"mongodb"}
```

Production:

```bash
npm start
```

> **nodemon watches source files but not `.env`.** After editing `.env`, restart
> the process manually.

### Running the frontend against this server

Point the frontend's `NEXT_PUBLIC_API_URL` at this server (`http://localhost:5000`).
Add the frontend origin to `FRONTEND_LOCAL` / `CORS_ORIGINS` so cookies are
accepted.

---

## Boot sequence

`server.js` runs in a fixed order; understanding it avoids configuration
confusion:

1. **Load `.env`** (`dotenv/config`) and **fail fast** if any required var is
   missing:
   `DB_URI`, `JWT_SECRET`, `WALLET_ENCRYPT_KEY`, `ENCRYPTION_KEY`.
   Missing vars print `[STARTUP] FATAL: Missing required env vars: …` and exit
   with code 1.
2. Build the Express app: `trust proxy` (1 hop by default), JSON body limit
   `10mb`, cookie parser, CORS with credentials.
3. Mount routers: `authRouter` then the main `router`.
4. Register a terminal JSON error handler.
5. Initialise providers: **SolanaTracker**, **Bitquery**, **Chainstream**, then
   the **AI composer** (using the resolved `aiEngine` config).
6. **Connect to MongoDB** (`DB_URI`).
7. Enable, hydrate (Mongo-first) and start the **provider budget tracker**.
8. `app.listen(PORT)`.

Because steps 5–7 are awaited before `listen`, a bad provider key or an
unreachable Mongo aborts startup rather than serving a half-initialised API.

---

## Environment variables

Create `.env` in the repository root. It is **git-ignored** and holds secrets.
Grouped by purpose:

### Core (required)

| Variable | Purpose |
| --- | --- |
| `DB_URI` | **Required.** MongoDB connection string. |
| `JWT_SECRET` | **Required.** Signs session JWTs. Use a long random value. |
| `WALLET_ENCRYPT_KEY` | **Required.** Encrypts stored custodial wallet material. |
| `ENCRYPTION_KEY` | **Required.** General at-rest encryption key. |
| `PORT` | HTTP port (default `5000`). |
| `NODE_ENV` | `production` / `development`. |

### Sessions & cookies

| Variable | Purpose |
| --- | --- |
| `SESSION_DAYS` | Session hard cap in days; also the cookie `maxAge`. |
| `JWT_ROTATION_INTERVAL_SEC` | Re-mint the access token if older than this (sliding sessions). |
| `JWT_HARD_CAP_SEC` | Absolute token cap before forced re-auth. |
| `FRONTEND_LOCAL` | Local frontend origin allowed by CORS. |
| `FRONTEND_PROD` | Production frontend origin allowed by CORS. |
| `CORS_ORIGINS` | Extra allowed origins, comma-separated. |
| `COOKIE_DOMAIN` | Auth cookie `Domain`. Leave empty unless API and frontend share a parent domain. |
| `COOKIE_SAMESITE` | `lax` (same-site) or `none` (cross-site; also requires `COOKIE_SECURE=true`). |
| `COOKIE_SECURE` | `true` when served over HTTPS. |
| `TRUST_PROXY_HOPS` | Proxy hops for `req.ip` (default `1`). |
| `MASTER_KEY` | Master key used by the wallet layer. |

> A wrong `COOKIE_DOMAIN` makes the browser discard the cookie: sign-in returns
> 200 but every authenticated request then fails with *Authentication required*.

### Solana

| Variable | Purpose |
| --- | --- |
| `SOLANA_RPC_URL` | Solana JSON-RPC (e.g. Helius). |
| `SOLANA_WS_URL` | Solana WebSocket for subscriptions. |
| `HELIUS_API_KEY` | Server-only Helius key. |

### Data providers

| Variable | Purpose |
| --- | --- |
| `DATA_PROVIDER` | `bitquery` (default) or `chainstream`. |
| `BITQUERY_API_KEY` | Bitquery v2 OAuth token. |
| `BITQUERY_BASE_URL` | Bitquery GraphQL endpoint. |
| `CHAINSTREAM_API_KEY` | Chainstream key. |
| `CHAINSTREAM_BASE_URL` | Chainstream endpoint. |
| `CHAINSTREAM_TIMEOUT_MS` | Chainstream timeout (default `30000`). |
| `SOLANA_TRACKER_API_KEY` | SolanaTracker key (optional; empty disables it). |
| `SOLANA_TRACKER_BASE_URL` | SolanaTracker endpoint. |
| `SOLANA_TRACKER_TIMEOUT_MS` | SolanaTracker timeout (default `20000`). |
| `DL_*` | Data-layer tuning (see below). |
| `DL_DISABLED_FEEDS` | Comma-separated feeds to disable at the source. |

### Authentication providers

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google OAuth client id. |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (from @BotFather). |

### Ask Aladdin / LLM

| Variable | Purpose |
| --- | --- |
| `OPENCODE_API_KEY` | `oc_sk_…` key for OpenCode. Empty ⇒ deterministic fallback answers. |
| `OPENCODE_BASE_URL` | Default `https://opencode.ai/zen/go/v1` (OpenAI-compatible). |
| `OPENCODE_SESSION` | Session label sent as `x-opencode-session`. |
| `OPENCODE_MODEL_QUICK` | Low-latency model (default `glm-5.3-flash`). |
| `OPENCODE_MODEL_DEEP` | Higher-effort model (default `glm-5.3`). |
| `OPENCODE_MODEL_DEFAULT` | Default model (default `glm-5.3-flash`). |
| `OPENROUTER_*` | Fallbacks read only if the `OPENCODE_*` vars are unset. |
| `AI_TEMPERATURE` | Sampling temperature (default `0.2`). |
| `AI_MAX_TOKENS_DEFAULT` | Default max tokens (default `1024`). |
| `AI_TIMEOUT_MS` | Per-request timeout (default `45000`). |
| `AI_REQUEST_TIMEOUT_MS` | Engine-level request timeout (default `60000`). |
| `AI_COMPOSER_ENABLED` | Set `false` to disable the composer. |
| `AI_VERIFIER_ENABLED` | Set `false` to disable answer verification. |

The LLM provider is **OpenCode Go** by default but the config also accepts an
OpenRouter key (`sk-or-…`) transparently.

### Data-layer tuning (`DL_*`)

Defaults encode the approved Bitquery Pro budget plan. All are optional; the
authoritative reader is `configs/dataLayer.js`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DL_ENABLED` | `true` | Master switch for the resilient data layer. |
| `DL_MAX_CONCURRENT` | `5` | Max concurrent upstream GraphQL calls. |
| `DL_BACKGROUND_CONCURRENT` | `4` | Background share; reserves one slot for user requests. |
| `DL_BITQUERY_RATE_PER_MIN` | `70` | Upstream rate cap. |
| `DL_DEX_RATE_PER_MIN` | `250` | DexScreener rate cap. |
| `DL_REQUEST_TIMEOUT_MS` | `120000` | Upstream request timeout. |
| `DL_RETRY_MAX` / `DL_RETRY_BASE_MS` / `DL_RETRY_MAX_MS` | `3` / `300` / `5000` | Retry policy. |
| `DL_BREAKER_TIMEOUT_MS` / `DL_BREAKER_FAILURE_THRESHOLD` | `90000` / `5` | Circuit breaker. |
| `DL_QUOTA_OPEN_MS` | `900000` | Breaker open window on quota/402. |
| `DL_AUTH_OPEN_MS` | `1800000` | Breaker open window on auth/401. |
| `DL_CACHE_MAX_ENTRIES` / `DL_CACHE_MAX_SIZE_BYTES` | `4000` / `62914560` | In-memory cache bounds. |
| `DL_FRESH_TTL_MS` / `DL_STALE_TTL_MS` | `120000` / `600000` | Feed freshness windows. |
| `DL_MONTHLY_POINT_CAP` | `1000000` | Monthly budget point cap. |
| `DL_DAILY_CAP` | `0` | Daily cap override (`0` derives from monthly). |
| `DL_CADENCE_<FEED>` | per feed | Warm cadence override, e.g. `DL_CADENCE_FORMATION`. |
| `DL_DISABLED_FEEDS` | – | Feeds disabled at source, comma-separated. |

There is also a `TD_*` namespace for the token-detail watch budget and cold-build
rate limiting (see the file for defaults).

---

## Scripts

| Script | Command | What it does |
| --- | --- | --- |
| `npm start` | `node server.js` | Start the server. |
| `npm run dev` | `nodemon server.js` | Dev server with auto-restart. |
| `npm run sync` | `node workers/tokenSync.js` | Run the token sync worker once. |
| `npm test` | `node --test tests/` | Run the test suite. |

There are also one-off helpers under `dev-scripts/` (composer/intent smoke
checks, Solana RPC check, Ask SSE probe, AI engine smoke) and `scripts/` (DB
clear, user listing).

---

## Architecture

```
                     ┌───────────────────────────────────────────┐
   Frontend (aladdin)│  routes/index.js   routes/auth.js          │
   ── HTTP / SSE ───▶│  routes/ask.js     routes/swap.js          │
                     └───────────────┬───────────────────────────┘
                                     │
                     ┌───────────────▼───────────────────────────┐
                     │  controllers/*  (request shaping, auth,    │
                     │  validators, rate limiting)                │
                     └───────────────┬───────────────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          ▼                          ▼                          ▼
   services/* (behaviour,     providers/index.js          aiEngine + aiComposer
   identity, participants,    (active provider + gate)    + aiTools + platformKnowledge
   cohorts, features,         bitquery | chainstream
   sessions, askProfile,      + dataLayer + budgetTracker
   syncToken, jupiter)        + solanaTracker + solPrice
          │                          │
          └───────────┬──────────────┘
                      ▼
                 models/*  →  MongoDB
```

Key ideas:

- **Resilient data layer.** All upstream GraphQL traffic flows through a small
  priority FIFO gate (`providers/gate.js`) that enforces per-session concurrency
  and reserves a slot for user-triggered requests. `providers/dataLayer.js` adds
  caching, TTLs, retries, per-provider circuit breakers, a monthly point budget
  (`providers/budgetTracker.js`, Mongo-backed) and demand-driven feed warm cadence.
- **Provider abstraction.** `providers/index.js` selects the active provider from
  `DATA_PROVIDER` and re-exports a uniform surface
  (`fetchNewTokens`, `fetchTrendingTokens`, `fetchTokenDetails`,
  `fetchTokenOHLC`, `fetchMovers`, `graphql`, …) so controllers never know which
  indexer is behind them.
- **Behavioural index.** Controllers/services derive behaviour labels, identities,
  cohorts and features from raw trades and holders, and persist them in MongoDB
  so boards are fast and reproducible.
- **Cold-build protection.** Expensive cache-missing builds are rate-limited per
  user and per IP (`middleware/rateLimiter.js`, `services/coldBuildLimiter.js`)
  so mint-scraping cannot drain the provider budget.
- **Auth is middleware.** `requireAuth` / `optionalAuth` / `requireAdmin` guard
  routes; `applyProfile` personalises Ask Aladdin per request.

---

## Data providers & integrations

| Provider | Role |
| --- | --- |
| **Bitquery** | Primary indexed Solana data: trades, pools, transfers, holders. GraphQL. |
| **Chainstream** | Alternate indexed provider, selectable via `DATA_PROVIDER=chainstream`. |
| **DexScreener** | DEX pair, price, liquidity and search metadata. |
| **Solana RPC (Helius)** | Live chain reads, balances, block data and subscriptions. |
| **Jupiter** | Swap routing/quote used by the buy flow. |
| **MongoDB** | The Aladdin internal index: tokens, holders, positions, behaviour identities. |

Provider switching is a single env change (`DATA_PROVIDER`); the surface exposed
to controllers is identical.

---

## The LLM layer (Ask Aladdin)

Ask Aladdin answers questions **grounded in the platform's own data and
knowledge**, never as free chat.

- **`configs/services/aiEngine.js`** resolves the LLM config: API key, base URL,
  model tiers (`quick`/`deep`/`default`), temperature, timeouts, session id.
  `OPENCODE_*` takes precedence over `OPENROUTER_*`.
- **`services/aiComposer.js`** is the provider-neutral client: `initAiComposer()`,
  `chat()`, `chatJson()`, `resolveModel()`, `keyProblem()`. It speaks the
  OpenAI-compatible `/chat/completions` API, sends `Authorization: Bearer`, and
  adds `x-opencode-session` when the base URL is an OpenCode endpoint. It accepts
  either `oc_sk_…` or `sk-or-…` keys.
- **`services/aiEngine.js`** orchestrates an answer: it resolves intent, gathers
  grounded evidence via `services/aiTools.js`, optionally routes through
  `services/platformKnowledge.js` for product/“where do I find…” questions, calls
  the composer, then validates the result (grounded page ids, no invented
  routes) before streaming it.
- **`services/platformKnowledge.js`** is the single source of truth for what Ask
  Aladdin knows about the product itself: the pitch, every real page/route, the
  answer modes, glossary terms and honest limits. It is dependency-free and unit
  tested; the engine validates any page id the model returns against this list so
  the assistant can never point at a nonexistent route.

**Answer modes:** `Trader` (fast, decision-oriented), `Analyst` (method,
provenance, reproducibility), `Token Creator` (holder quality, retention, launch
health).

**Deterministic fallback.** With `OPENCODE_API_KEY` empty, the server still runs
and returns deterministic, grounded answers instead of failing — useful for local
development and tests.

> Some OpenCode Go models (e.g. DeepSeek) require the workspace Privacy region to
> be **Global**; without it they return HTTP 400. The default GLM models do not.

---

## HTTP API reference

Two routers are mounted: `authRouter` and the main `router`. `requireAuth` means
a valid session cookie or `Authorization: Bearer` token is required.

### Auth — `routes/auth.js`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/phantom` | – | Solana wallet sign-in. |
| POST | `/api/auth/google` | – | Google sign-in. |
| POST | `/api/auth/telegram` | – | Telegram sign-in. |
| GET | `/api/auth/nonce` | – | Nonce for wallet sign-in. |
| POST | `/api/auth/logout` | – | Clear session. |
| GET | `/api/auth/config` | – | Which auth methods are enabled. |
| GET | `/api/auth/me` | yes | Current user profile. |
| PATCH | `/api/auth/me` | yes | Update profile. |
| POST | `/api/auth/wallet` | yes | Generate a custodial wallet. |
| GET | `/api/auth/wallet` | yes | Read the custodial wallet. |

### Ask Aladdin — `routes/ask.js`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/ask` | yes | Stream an answer (SSE). Rate-limited 20/min. |
| GET | `/api/ask/sessions` | yes | List conversation sessions. |
| POST | `/api/ask/sessions` | yes | Save a session. |
| DELETE | `/api/ask/sessions/:id` | yes | Delete a session. |
| POST | `/api/ask/sessions/:id/duplicate` | yes | Duplicate a session. |
| GET | `/api/ask/sessions/active` | yes | Active session. |
| GET | `/api/ask/sessions/:id/active` | yes | Active session by id. |
| GET | `/api/ask/sessions/:id/runs/latest` | yes | Latest analysis run for a session. |
| GET | `/api/ask/profile` | yes | Personalisation profile. |
| PATCH | `/api/ask/profile` | yes | Update personalisation profile. |

### Swap — `routes/swap.js`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/swap/quote` | yes | Quote a swap (Jupiter). |
| POST | `/api/swap` | yes | Execute a swap. |
| GET | `/api/swap/balance` | yes | Wallet balance. |
| GET | `/api/swap/history` | yes | Trade history. |
| GET | `/api/swap/price/:mint` | yes | Price for a mint. |

### Public intelligence — `routes/index.js`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | – | Liveness probe. |
| GET | `/api/token-info/:mint` | – | Token info. |
| GET | `/api/token-chart/:mint` | – | OHLC chart data. |
| GET | `/api/token-detail/:mint` | optional | Cold-build rate limited; signed-in callers get a per-user window. |
| GET | `/api/launches` | – | Launch lifecycle board. |
| GET | `/api/search` | – | Global token search. |
| GET | `/api/movers` | – | Movers + why. |
| GET | `/api/og` | – | Established / OG tokens. |
| GET | `/api/smart-money` | – | Proven wallets. |
| GET | `/api/formation` | – | Market formation states. |
| GET | `/api/insiders` | – | Insider / creator activity. |
| GET | `/api/clusters` | – | Coordinated wallets. |
| GET | `/api/historical` | – | Historical formation matches. |
| GET | `/api/alerts` | – | Behavioural alert feed. |
| GET | `/api/price/sol` | – | SOL price. |

### Watchlist — `routes/index.js`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/watchlist` | yes | List saved tokens. |
| POST | `/api/watchlist/:mint` | yes | Save a token. |
| DELETE | `/api/watchlist/:mint` | yes | Remove a token. |

### Token data (auth) — `routes/index.js`

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/tokens/:mint/sync` | Force a token sync. |
| GET | `/api/tokens/:mint` | Token record. |
| GET | `/api/tokens/:mint/trades` | Trades. |
| GET | `/api/tokens/:mint/participants` | Participants. |
| GET | `/api/tokens/:mint/first-buyers` | First buyers. |
| GET | `/api/tokens/:mint/holders` | Holders. |
| GET | `/api/tokens/:mint/profitable-wallets` | Most profitable wallets. |
| GET | `/api/wallets/:wallet/tokens/:mint` | Wallet position in a token. |

### Internal — `routes/index.js`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/internal/wallets/:wallet/behaviour-evaluation` | yes | Behaviour evaluation. |
| GET | `/api/internal/tokens/:mint/wallets/:wallet/identity` | yes | Identity debug. |
| GET | `/api/internal/budget` | yes + admin | Provider budget snapshot. |
| POST | `/api/internal/budget/reset` | yes + admin | Reset budget counters. |

---

## Data model (MongoDB)

Collections are defined in `models/`. Broadly:

- **Market / tokens:** `token`, `tokenHolder`, `tokenLifecycle`, `tokenFeature`,
  `trade`, `solPrice`.
- **Wallets & behaviour:** `wallet`, `walletBehaviourIdentity`,
  `walletBehaviourIdentityHistory`, `walletRecentBehaviourState`,
  `walletBehaviourEvidence`, `walletFeature`, `walletSegment`,
  `walletTokenEpisode`, `walletTokenFeature`, `walletTokenRole`,
  `walletTokenPosition`.
- **Definitions:** `behaviourDefinition`, `cohortDefinition`, `cohortMembership`.
- **Ask Aladdin:** `askConversation`, `askAnalysisRun`.
- **Account / app:** `user`, `watchlist`.
- **Provider cache:** `providerRawSnapshot`.

Behaviour rules live in `rules/` (`migrationSpecialistV1.js`, `scalperV1.js`) so
classification logic is versioned and testable.

---

## Workers

- **`workers/tokenSync.js`** (`npm run sync`) — walks tracked tokens and refreshes
  their records via `services/syncToken.js`. Intended to run on a schedule
  (cron / external scheduler); it is not started by `server.js`.

---

## Testing

```bash
npm test          # node --test tests/
```

The suite is plain `node --test` (no Jest) and covers the data layer, providers,
behaviour/identity services, the answer engine, composer key/model handling, and
route behaviour. Run it before committing server changes.

Additional manual checks:

```bash
node dev-scripts/smoke-ai-engine.mjs       # end-to-end answer smoke test
node dev-scripts/check-composer.mjs        # composer connectivity
node dev-scripts/check-intent.mjs          # intent routing
node dev-scripts/check-solana-rpc.mjs      # RPC reachability
node dev-scripts/probe-ask-sse.mjs         # raw /api/ask SSE probe
```

---

## Security notes

- **Secrets stay server-side.** `MASTER_KEY`, `WALLET_ENCRYPT_KEY`,
  `ENCRYPTION_KEY`, provider keys, OAuth secrets and signing keys must never be
  exposed to the browser.
- **Fail-fast configuration.** The four required env vars abort startup rather
  than running with insecure defaults.
- **CORS + cookies.** Only whitelisted origins receive credentials; a mismatched
  `COOKIE_DOMAIN` / `COOKIE_SAMESITE` silently breaks auth, so verify these
  together across environments.
- **Budget & abuse controls.** Concurrency gates, circuit breakers, cold-build
  rate limits and a monthly point cap bound provider spend and reduce scrape
  abuse.
- **No advice posture.** The product is designed to show evidence, not to give
  trading advice or buy/sell verdicts.

---

## Known limits

- **`SOLANA_TRACKER_API_KEY` empty** disables the SolanaTracker provider.
- **pump.fun is unreachable** from the server (Cloudflare block, error 1016).
- **Some OHLC chart feeds** need a dataset tier the current Bitquery plan may
  forbid; disable them via `DL_DISABLED_FEEDS=chart` if the plan lacks access.
- **Some OpenCode Go models** (e.g. DeepSeek) require workspace Privacy region =
  Global, otherwise 400. The default GLM models are unaffected.
- **No Dockerfile / docker-compose** is provided; deploy with a Node process
  manager and an external MongoDB.
- **Copy-trading, credit purchasing, and the docs/API pages** are not fully live;
  the API surfaces are prototypes and no API keys are issued.
