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