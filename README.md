# Aladdin Intelligence — Frontend

> **Behaviour beneath the market.**

Aladdin Intelligence is an on-chain intelligence terminal for Solana. It resolves
tokens, wallets and transactions into decision-ready evidence: what is actually
moving, who is behind it, and what changed underneath the price.

This repository is the **frontend**: a Next.js (App Router) application that
renders every product surface, talks to the Aladdin backend over HTTP + SSE, and
streams live Solana data straight from an RPC node.

The backend lives in a **separate repository** (`aladdin-server`). The frontend
does not contain an API; it calls the backend at `NEXT_PUBLIC_API_URL`.

---

## Table of contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [How the frontend works](#how-the-frontend-works)
- [Services the frontend provides](#services-the-frontend-provides)
- [Product surfaces (routes)](#product-surfaces-routes)
- [Directory map](#directory-map)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Requirements

- **Node.js 20+** (Next.js 15 / React 19)
- **npm**
- The **Aladdin backend** running and reachable (default `http://localhost:5000`).
  See the `aladdin-server` README.
- A modern browser. A Solana wallet extension is optional (Google / Telegram
  sign-in also work).

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file (see Environment variables below)
#    Copy the example values and point NEXT_PUBLIC_API_URL at your backend.

# 3. Run the dev server
npm run dev
# → http://localhost:3000
```

Make sure the backend is up first. If the backend is not reachable you will see
`Failed to fetch` toasts and empty boards; the UI does not ship mock data by
default (`NEXT_PUBLIC_USE_MOCK_DATA=false`).

### Production build

```bash
npm run build
npm run start
```

> Do **not** run `npm run build` while a `npm run dev` process is running against
> the same `.next` directory — the two will fight over build artifacts.

---

## Environment variables

All runtime configuration lives in **`.env.local`** (git-ignored). This is a pure
client-side app, so every variable that the browser needs **must** be prefixed
with `NEXT_PUBLIC_` and is inlined into the bundle at build time.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | **yes** | Base URL of the Aladdin backend, e.g. `http://localhost:5000`. Used by `app/lib/api.ts` for every request. |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | **yes** | Solana RPC endpoint (e.g. Helius). Powers live balances and token reads. |
| `NEXT_PUBLIC_SOLANA_WS_URL` | recommended | WebSocket endpoint for account subscriptions (pub/sub). |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | for Google sign-in | Google OAuth client id. |
| `NEXT_PUBLIC_TELEGRAM_BOT_NAME` | for Telegram sign-in | Telegram bot username (from @BotFather). |
| `NEXT_PUBLIC_TELEGRAM_BOT_ID` | for Telegram sign-in | Telegram bot numeric id. |
| `NEXT_PUBLIC_APP_ENV` | no | Free-form environment label (`production`, `development`, …). |
| `NEXT_PUBLIC_DEMO_MODE` | no | Toggles demo affordances. Default `false`. |
| `NEXT_PUBLIC_USE_MOCK_DATA` | no | When `true`, boards render local fixtures instead of hitting the backend. Default `false`. |
| `NEXT_PUBLIC_TAILSCALE_HOST` | no | Only for the Tailscale demo script. |
| `ALADDIN_DEVNET_MINT_AUTHORITY` | no | **Server-only.** Never prefix with `NEXT_PUBLIC_`. |
| `SOLANA_DEVNET_RPC_URL` | no | **Server-only.** Devnet sandbox RPC. |

### ⚠️ Secrets

`NEXT_PUBLIC_*` values are compiled into the browser bundle and are **public**.
The Solana RPC key is intentionally public here — restrict it by domain in your
RPC provider dashboard rather than trying to hide it. Do **not** put OAuth client
**secrets**, API keys or signing keys in any `NEXT_PUBLIC_*` variable. The Google
`CLIENT_SECRET` and any authority keys must live only in the backend `.env`.

---

## Scripts

| Script | Command | What it does |
| --- | --- | --- |
| `npm run dev` | `next dev` | Start the dev server on :3000 with hot reload. |
| `npm run build` | `next build` | Production build. |
| `npm run start` | `next start` | Serve the production build. |
| `npm run lint` | `eslint` | Lint the codebase. |
| `npm test` | `node --test <files>` | Run the UI regression suite (the explicit `.mjs` list lives in `package.json`). |

There is a Tailscale helper at `scripts/start-tailscale-demo.ps1` for exposing a
local dev server over a Tailscale network for device testing. It references an
`npm run demo` script that is **not currently defined** in `package.json`; start
the app with `npm run dev` and drive the tunnel manually if you use it.

---

## How the frontend works

- **Framework.** Next.js App Router with React Server Components by default.
  Interactive surfaces are client components (`"use client"`), collected under
  `app/components/**`.
- **Data fetching.** Two paths:
  1. **Backend API** via `app/lib/api.ts` (`apiFetch` for JSON, `askSseFetch` for
     Server-Sent Events). Credentials are sent as cookies (`credentials:
     "include"`), so auth is cookie-based.
  2. **Direct Solana RPC / WebSocket** from the browser for live balances and
     account subscriptions (`app/providers/SolanaProvider.tsx`).
- **Auth.** `app/contexts/AuthContext.tsx` wraps the app. Sessions are cookie
  based (httpOnly JWT minted by the backend); the frontend only reads the
  resulting user profile from `/api/auth/me`.
- **State.** A mix of React context (auth, watchlist), custom hooks
  (`app/hooks/**`, one per data surface), and a small pub/sub store
  (`app/components/search/searchBus.ts`). Boards cache per-tab and refresh on an
  interval.
- **Styling.** Plain CSS files co-located with the app (`globals.css`,
  `theme.css`, `mobile-ux.css`, `workspace.css`, `table-first.css`,
  `fidelity.css`, plus per-feature CSS). No CSS framework.

### Request lifecycle (example: one board)

```
page.tsx (server component)
  └─ Feature component (client)
       └─ app/hooks/useXxx.ts        → apiFetch("/api/xxx")
            └─ app/lib/api.ts         → fetch(`${NEXT_PUBLIC_API_URL}/api/xxx`, credentials: "include")
                 └─ aladdin-server    → MongoDB / providers → JSON
```

### Ask Aladdin (streaming)

```
app/components/ask-aladdin/AskWorkspace.tsx
  └─ app/features/ask-aladdin/run-analysis.ts  runAskAladdinAnalysis()
       └─ app/lib/api.ts  askSseFetch("/api/ask", { question, mode, period, depth, ... })
            └─ aladdin-server /api/ask  → streams SSE frames: activity → complete
```

The response is rendered as structured, sourced answer blocks (tables, evidence
snapshots, page actions and follow-up suggestions) rather than free chat text.

---

## Services the frontend provides

The frontend is more than a set of pages; it owns several client capabilities:

- **Shell & navigation** — top bar, mobile dock, global overlays, and a responsive
  layout (`app/components/navigation`, `app/components/layout`).
- **Authentication UX** — Google, Telegram and Solana-wallet sign-in flows, plus
  the auth context that exposes the current user to every surface
  (`app/contexts/AuthContext.tsx`, `app/components/wallet-connect`).
- **Wallet services** — connect/disconnect, balance reads and an in-app Aladdin
  wallet (`app/hooks/useWalletBalance.ts`, `app/hooks/useAladdinWallet.ts`,
  `app/providers/SolanaProvider.tsx`).
- **Swap (buy flow)** — quote/build via the backend Jupiter route
  (`app/services/jupiter-swap.ts`, `app/components/jupiter-swap`).
- **Global search** — a portal overlay with a shared store, fetching matches from
  the backend `/api/search` (`app/components/search`, `app/services/search.ts`).
  The portal deliberately escapes the mobile nav's stacking/containing context.
- **Board data services** — one hook per surface (`app/hooks/useLaunches.ts`,
  `useMovers.ts`, `useSmartMoney.ts`, `useFormation.ts`, `useInsider.ts`,
  `useClusters.ts`, `useHistorical.ts`, `useOg.ts`, `useAlerts.ts`,
  `useWatchlist.ts`) with per-tab caching and interval refresh.
- **Workspace & persistence** — saved queries, dashboards and exports index
  surfaces. Ask Aladdin investigations are ephemeral for anonymous visitors and
  follow signed-in accounts across devices via the backend session API
  (`app/services/workspace-local.ts`, `app/services/workspace-remote.ts`,
  `app/services/workspace-storage.ts`, `app/services/analysis-run-store.ts`).
- **Ask Aladdin workspace** — investigations, conversation sessions, attached
  context, structured results and CSV/JSON export
  (`app/components/ask-aladdin`, `app/features/ask-aladdin`).
- **Token terminal** — the per-token view with embedded chart and tabs
  (Transactions, Participants, Profitable, Largest Holders, First 100, Holders,
  Live State, Historical Match) (`app/components/token`, `app/hooks/useToken*`).
- **Theming & responsiveness** — theme tokens, a 760px mobile breakpoint, and a
  table-first data view (`theme.css`, `mobile-ux.css`, `table-first.css`).

---

## Product surfaces (routes)

All routes are real pages under `app/`. Dynamic routes take an id and cannot be
deep-linked from a generic answer.

| Route | Surface |
| --- | --- |
| `/` | Landing / sign-in. |
| `/launches` | Live market-discovery board (New, Almost Bonded, Migrated, Trending). |
| `/movers` | Tokens that moved, with what changed underneath. |
| `/narratives` | Meme narratives ranked by participation quality. |
| `/og` | Established / mature meme assets. |
| `/smart-money` | Wallets with proven, repeatable performance. |
| `/formation` | On-chain participation states + transition evidence. |
| `/insiders` | Creator / funding / early-wallet relationships. |
| `/clusters` | Coordinated-wallet groups (evidence, not accusation). |
| `/historical` | Live formations compared to historical outcomes. |
| `/watchlist` | Signed-in saved tokens. |
| `/alerts` | High-signal behavioural event feed. |
| `/ask-aladdin` | Natural-language reasoning workspace. |
| `/live/:id` | Per-token terminal (dynamic). |
| `/token/:id` | Redirect to `/live/:id`. |
| `/wallet/:id` | Opens a wallet as Ask Aladdin context. |
| `/queries` | Saved queries index. |
| `/dashboards` | Dashboards built from saved queries. |
| `/copy-traders` | Coming-soon copy-trading surface. |
| `/exports` | Structured data exports index. |
| `/credits` | Aladdin credits (purchase not yet available). |
| `/settings` | Account and terminal preferences. |
| `/docs` | Product documentation placeholder. |
| `/api` | Prototype developer documentation (no keys issued). |
| `/ask-ifa` | Compatibility redirect to `/ask-aladdin`. |

---

## Directory map

```
app/
  <route>/            One folder per product surface (page.tsx + feature CSS)
  api/                A single placeholder page (/api docs surface)
  components/         All client UI, grouped by feature
    account  ask-aladdin  ifa  intelligence  jupiter-swap  landing
    launches  layout  navigation  search  tables  theme  token  ui
    wallet-connect  watchlist
  contexts/           AuthContext, WatchlistContext
  features/           ask-aladdin run-analysis pipeline
  hooks/              One data hook per surface + wallet hooks
  lib/                api.ts (apiFetch / askSseFetch), auth, toast
  providers/          SolanaProvider (RPC + wallet adapters)
  services/           jupiter-swap, search, profile, workspace-local, analysis-run-store
  types/              Shared TypeScript types
  utils/              Formatting / derivation helpers
tests/                node --test UI regression suite (.mjs)
scripts/              Tailscale demo helper
next.config.ts        Next config (dev origins, tracing root)
```

---

## Testing

The UI regression suite is plain `node --test` over `.mjs` files (no Jest). The
exact file list is in `package.json`:

```bash
npm test
```

It covers Ask Aladdin behaviour, workspace, theming, table-first layout, mobile
workspace activity, launches refinement, wallet connect, mobile trader UX, UI
degradation, watchlist, trade behaviour and alerts. Type-checking and linting:

```bash
npx tsc --noEmit
npm run lint
```

The suite is a fast structural guard: it renders components/stores against
fixtures and asserts on markup and state transitions. It is intentionally not a
browser test runner.

---

## Troubleshooting.

- **All boards empty / "Failed to fetch".** The backend is not running or
  `NEXT_PUBLIC_API_URL` is wrong. Confirm the backend `/` returns
  `{ status: "ok" }`.
- **Signed in but every request 401s.** Auth uses cookies. In development the
  frontend and backend must agree on origin/cookies; cross-site deployments need
  the backend's `COOKIE_SAMESITE=none` + `COOKIE_SECURE=true` and a correct
  `COOKIE_DOMAIN`. See the server README.
- **Wallet will not connect on mobile.** Wallet extensions are desktop-only;
  use Google/Telegram sign-in, or a mobile wallet's in-app browser.
- **Live balances stale.** Check `NEXT_PUBLIC_SOLANA_RPC_URL` /
  `NEXT_PUBLIC_SOLANA_WS_URL` and the RPC provider's key restrictions.
- **Weird build behavior after switching dev/prod.** Stop the dev server before
  `npm run build`; remove `.next` if artifacts look mixed.
