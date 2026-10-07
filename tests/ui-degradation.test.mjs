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