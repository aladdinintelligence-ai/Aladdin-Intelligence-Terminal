import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = f => readFileSync(join(root, f), "utf8");

test("time utils expose relative freshness + staleness helpers", () => {
  const util = read("app/utils/time.ts");
  assert.match(util, /export function timeAgo/);
  assert.match(util, /just now/);
  assert.match(util, /s ago/);
  assert.match(util, /m ago/);
  assert.match(util, /export function isStale/);
});

test("every intel hook meta exposes backend stale flag", () => {
  for (const hook of ["useOg", "useSmartMoney", "useFormation", "useInsider", "useClusters", "useHistorical"]) {
    const src = read(`app/hooks/${hook}.ts`);
    assert.match(src, /stale\?: boolean/);
  }
});

test("panel meta line renders live updated-ago badge with stale flag", () => {
  const ml = read("app/components/intelligence/MetaLine.tsx");
  assert.match(ml, /data-stale/);
  assert.match(ml, /timeAgo\(/);
  assert.match(ml, /updated/);
  assert.match(ml, /setInterval/);
});

test("FeaturePage renders each intel panel through MetaLine", () => {
  const fp = read("app/components/intelligence/FeaturePage.tsx");
  assert.match(fp, /import MetaLine/);
  assert.equal((fp.match(/<MetaLine/g) || []).length >= 6, true);
  assert.equal((fp.match(/className="ogMetaLine"/g) || []).length, 0);
});

test("format helpers render N/A for missing or non-finite numbers", () => {
  const fmt = read("app/utils/format.ts");
  assert.match(fmt, /MaybeNumber/);
  assert.match(fmt, /Number\.isFinite/);
  assert.match(fmt, /where money|return "—"/);
});

test("FeaturePage renders N/A instead of crashing on missing fields", () => {
  const fp = read("app/components/intelligence/FeaturePage.tsx");
  assert.equal(/t\.top10 \|\| 0/.test(fp), false);
  assert.match(fp, /t\.cohortNetUsd != null/);
  assert.match(fp, /t\.netUsd != null/);
  assert.match(fp, /t\.similarity != null/);
  assert.match(fp, /t\.retained != null/);
  assert.match(fp, /w\.winRate != null/);
  assert.match(fp, /w\.holdingPct != null/);
});

test("each intel panel is isolated behind an error boundary", () => {
  const pb = read("app/components/intelligence/PanelBoundary.tsx");
  assert.match(pb, /extends Component/);
  assert.match(pb, /getDerivedStateFromError/);
  assert.match(pb, /PANEL UNAVAILABLE/);
  assert.match(pb, /Other panels are unaffected/);
  const fp = read("app/components/intelligence/FeaturePage.tsx");
  assert.match(fp, /import PanelBoundary/);
  assert.ok((fp.match(/<PanelBoundary/g) || []).length >= 8);
});

test("SOL price is fetched through the backend, never CoinGecko directly", () => {
  const tb = read("app/components/layout/TopBar.tsx");
  assert.match(tb, /apiFetch/);
  assert.match(tb, /\/api\/price\/sol/);
  assert.equal(/coingecko\.com/.test(tb), false, "direct CoinGecko URL removed");
});

test("Ask Aladdin surfaces a freshness line on stale, unknown and current answers", () => {
  const fl = read("app/components/ask-aladdin/FreshnessLine.tsx");
  assert.match(fl, /Data current as of/);
  assert.match(fl, /No current data/);
  assert.match(fl, /data-state/);
  const sa = read("app/components/ask-aladdin/StructuredAnswer.tsx");
  assert.match(sa, /FreshnessLine state="fresh"/);
  assert.match(sa, /FreshnessLine state="stale"/);
  assert.match(sa, /Source: Simulated data/);
  assert.ok(sa.indexOf("QueryResultTable") < sa.indexOf("profileSummary"));
});

test("evidence rows render the typed freshness field", () => {
  const ec = read("app/components/ask-aladdin/EvidenceClaim.tsx");
  assert.match(ec, /item!\.freshness/);
});