# Aladdin Intelligence

> **Behaviour beneath the market.**

Aladdin Intelligence is an **on-chain intelligence terminal for Solana**. It
resolves tokens, wallets and transactions into decision-ready evidence: what is
actually moving, who is behind it, and what changed underneath the price.

This document is the combined product + architecture overview for both
repositories. For environment and run instructions see the
[frontend README](./README.md) and the `aladdin-server` README.

---

## The problem

Solana's meme and low-cap markets move faster than any human can read. A trader
watching a token pump sees a price line and asks the only question that matters:
**why?** The answers exist on-chain — who bought, when, how concentrated the
supply is, whether the same wallets keep appearing together, whether early buyers
are holding or dumping — but the raw data is enormous, fragmented across
providers, and unreadable at the speed it arrives.

Today the alternatives are bad:

- **Price charts and social feeds** show the outcome, not the cause. Hype and
  noise crowd out evidence.
- **Raw block explorers** show one transaction at a time. Nobody can pattern-match
  hundreds of wallets by hand.
- **"Alpha" Discord/Twitter calls** are unsourced and unaccountable. There is no
  methodology and no way to check the claim.
- **Generic dashboards** show what happened, but rarely *why* or *who*, and almost
  never let you ask a follow-up question in plain language.

The market lacks a tool that turns on-chain behaviour into **sourced,
reproducible evidence** — and that lets you interrogate it conversationally.

## What Aladdin is

Aladdin is a terminal that watches on-chain behaviour and explains it:

- **Market discovery.** Live boards for launches (New, Almost Bonded, Migrated,
  Trending), movers, narratives, and established/OG assets.
- **Wallet intelligence.** Surfaces wallets with *proven, repeatable* performance
  and classifies observed behaviour (accumulating, distributing, exiting…).
- **Structure & coordination.** Shows participation states, concentration, flow,
  creator/funding relationships, and groups of wallets that repeatedly move
  together.
- **Per-token terminal.** A live terminal for any token with transactions,
  participants, profitable wallets, holders, first 100 and historical context.
- **Ask Aladdin.** A natural-language workspace that answers questions grounded in
  the platform's real data — returning tables, evidence and links to the exact
  page that holds the answer.

The through-line is a single stance: **Aladdin shows evidence, not verdicts.**
It never says buy/sell/hold, never predicts prices, and describes behaviour labels
and similarity scores as observations about records — not facts about people or
the future.

### Positioning

> Aladdin explains market behaviour with sourced evidence instead of price noise
> or social hype. Every number is tied to observed on-chain records, and every
> label is described as an observed behaviour, not a guarantee, identity or
> accusation.

### Audience

Traders, analysts and token creators who need to understand what is happening
on-chain and why, without giving up grounding or methodology.

---

## How the platform works

```
                 Solana chain
                      │
      ┌───────────────┼───────────────────────────────┐
      ▼               ▼               ▼                ▼
  Bitquery      DexScreener     Solana RPC        Chainstream
  (indexed      (pairs, price,  (Helius: live     (alternate
   trades/       liquidity,      reads, subs)      indexer,
   holders)      search)                            fallback)
      │               │               │                │
      └───────────────┴───────┬───────┴────────────────┘
                              ▼
                    Resilient data layer
        (priority gate · cache/TTL · retries · circuit
         breakers · monthly point budget · demand-driven
         warm cadence · cold-build rate limits)
                              ▼
                  Behavioural index (MongoDB)
        tokens · holders · trades · wallet identities ·
        cohorts · features · lifecycle · episodes
                              ▼
      ┌───────────────────────┼────────────────────────┐
      ▼                       ▼                        ▼
  Market boards         Token terminal          Ask Aladdin
  (launches, movers,    (transactions,          (grounded LLM +
   smart money,          holders, first 100,      real tools +
   formation, insiders,  historical match)        platform knowledge)
   clusters, historical)
                              ▼
                   Next.js frontend (aladdin)
        boards · terminals · watchlist · alerts ·
        workspace (queries, dashboards, exports)
```

**1. Ingest.** A resilient data layer pulls indexed on-chain data from Bitquery
(primary) or Chainstream (alternate), market metadata from DexScreener, and live
chain state from a Solana RPC. All upstream traffic is serialised through a small
priority gate, cached with freshness/stale TTLs, retried, and protected by
per-provider circuit breakers and a monthly point budget. Heavy cache-missing
builds are rate-limited per user/IP so the budget cannot be drained by scraping.

**2. Index behaviour.** Raw trades and holders are transformed into a behavioural
index in MongoDB: tokens and their lifecycle, wallets and their observed identity,
cohorts, features, roles, positions and episodes. Classification rules are
versioned (`rules/migrationSpecialistV1.js`, `scalperV1.js`), so labels are
methodology-backed rather than ad-hoc.

**3. Serve.** The API exposes boards, token terminals, a watchlist, an alert feed,
auth and swap routes — all consumed by the Next.js frontend.

**4. Reason.** Ask Aladdin routes a question through grounded tools: it gathers
the actual records, and for product/"where do I find…" questions it consults the
platform knowledge base. An LLM composes the answer, but the engine validates the
result (real data, real page routes) before streaming it back as structured
blocks with follow-ups.

**Ask Aladdin answer modes:**

- **Trader** — fast, decision-oriented; the strongest signal and what changed.
- **Analyst** — method, provenance, reproducibility; unit of analysis, dataset,
  confounders, data quality.
- **Token Creator** — holder quality, attention-to-holder conversion, retention,
  post-spike health.

---

## The intelligence concepts

Aladdin's language is deliberately observational. Key terms:

- **Smart / Profitable Money** — wallets explained by realised performance,
  repeatability and entry timing: evidence of skill, not a tip.
- **Migration Specialist** — a wallet whose observed trading repeatedly focuses on
  tokens approaching or completing migration.
- **First 100** — the first 100 buyers of a token, tracked for retention.
- **Behaviour label** — an observed classification (accumulating, distributing,
  exiting, scalping). Describes records, not people.
- **Formation state** — the current on-chain participation state of a token, with
  the evidence behind any transition.
- **Coordinated wallets** — groups that repeatedly move together or share supply:
  evidence of co-movement, not an accusation.
- **Insider / creator activity** — identifiable creator, funding and early-wallet
  relationships, shown without unsupported claims.
- **Bonding curve / launch lifecycle** — New → Almost Bonded → Migrated →
  Trending.
- **Established / OG** — mature assets tracked for structural/behavioural change.
- **Evidence snapshot** — the specific, hashed records and analysis period an
  answer came from, so results are auditable and reproducible.
- **Historical match / similarity** — context about how a live formation resembles
  past outcomes. Never a prediction.

---

## The product surfaces

| Area | Surfaces |
| --- | --- |
| **Market discovery** | Launches, Movers + Why, Narratives, Established / OG |
| **Intelligence** | Smart / Profitable Money, Market Formation, Insider / Creator Activity, Coordinated Wallets, Historical Match, Alerts |
| **Per-token** | Live Terminal (Transactions, Participants, Most Profitable, Largest Holders, First 100, Holders, Live State, Historical Match) |
| **Ask Aladdin** | Reasoning workspace with sessions, attached context, structured results, exports |
| **Workspace** | Saved Queries, Dashboards, Exports |
| **Personal / account** | Watchlist, Settings, Credits (purchase coming soon) |

---

## Technology

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, plain CSS |
| Backend | Node.js (ESM), Express 5, MongoDB + Mongoose |
| Chain | Solana Web3, Helius RPC + WebSocket, Jupiter (swap routing) |
| Data | Bitquery (primary), Chainstream (alternate), DexScreener, SolanaTracker |
| AI | OpenCode Go (OpenAI-compatible), provider-neutral composer, grounded tools + platform knowledge base |
| Auth | Google, Telegram, Solana wallet sign-in; cookie-based sliding JWT sessions |

The frontend and backend are **separate repositories** and deploy independently.
Auth is cookie-based; CORS and cookie settings must agree across environments.

---

## What is live, and what is not

**Live:** market discovery boards, token terminals, smart money / formation /
insider / cluster / historical intelligence, watchlist, alerts, Ask Aladdin,
wallet sign-in and swap quoting.

**Not yet live (stated honestly in-product):**

- **Copy-trading** — coming soon; the page points users to Smart Money for
  evidence.
- **Credit purchasing** — not yet available.
- **Docs and API pages** — prototype surfaces; no API keys are issued.

**Operational caveats:** some OHLC feeds depend on provider plan tier; the
`SOLANA_TRACKER_API_KEY` is optional; pump.fun is currently unreachable from the
server due to a provider-side block; and some third-party LLM models require a
specific workspace privacy region.

---

## Why it matters (adoption)

**For traders.** The 30 seconds after a token starts moving are worth more than
the hour after. Aladdin compresses hordes of raw transactions into the one thing
that matters — *who is behind this and what changed* — on the board where you
already are, then lets you ask the follow-up in plain language.

**For analysts.** Every claim is tied to a reproducible evidence snapshot with a
stated methodology, unit of analysis, dataset and confounders. The Analyst mode
exists precisely for people who refuse to trust a black box.

**For token creators.** Launch success is a holder-quality problem. Aladdin shows
attention-to-holder conversion, retention and post-spike health, so creators can
see whether the audience that arrived actually stayed.

**Why it can grow.** The behavioural index is the moat: as more tokens and wallets
are observed, the identity, cohort and historical-match layers get sharper, which
makes every surface more useful — and every surface feeds Ask Aladdin. The same
grounded-answer engine generalises from "what is this token doing?" to any
on-chain question, so the product widens without the data model changing.

**Why it is trustworthy.** Aladdin is built on a restraint most "alpha" tools skip:
it labels behaviour, cites evidence, and refuses to give advice. That is what
makes it usable by professionals and defensible as a product rather than a tip
channel.

---

## Repositories & running it

Both repositories are separate git repos. Run the backend first.

```bash
# Backend (aladdin-server) — requires MongoDB + provider keys
npm install
npm run dev            # http://localhost:5000

# Frontend (aladdin) — points at the backend
npm install
npm run dev            # http://localhost:3000
```

See the [frontend README](./README.md) for environment variables and the
`aladdin-server` README for the full server configuration, provider setup and
HTTP API reference.

---

## Honest limits

Aladdin does not give trading advice, price predictions, or buy/sell/hold/avoid
verdicts. Behaviour labels and similarity scores are observations about records —
not statements about people, intent or the future. Where a feature is not live,
the product says so.
