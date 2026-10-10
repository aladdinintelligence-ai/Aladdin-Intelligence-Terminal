import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("useAlerts polls the live /api/alerts endpoint with a shared cache", () => {
  const hook = read("app/hooks/useAlerts.ts");
  assert.match(hook, /apiFetch/);
  assert.match(hook, /\/api\/alerts\?limit=/);
  assert.match(hook, /CACHE_TTL = 60_000/);
  const fp = read("app/components/intelligence/FeaturePage.tsx");
  assert.match(fp, /useAlerts\(/,);
});
test("/alerts is a real AlertsFeed wired into the live meta chain", () => {
  const fp = read("app/components/intelligence/FeaturePage.tsx");
  const page = read("app/alerts/page.tsx");
  assert.match(page, /FeaturePage kind="alerts"/);
  assert.match(fp, /kind === "alerts" \? alerts\.meta/);
  assert.match(fp, /AlertsFeed alerts=\{alerts\.alerts\}/);
  assert.match(fp, /Link href=\{`\/live\/\$\{a\.mint\}`\}/);
  assert.doesNotMatch(fp, /Profitable wallet entered/);
  assert.doesNotMatch(fp, /\/live\/bark/);
});
test("alerts rows attach context for Ask Aladdin without auto-submitting", () => {
  const fp = read("app/components/intelligence/FeaturePage.tsx");
  const ws = read("app/components/ask-aladdin/AskWorkspace.tsx");
  assert.match(fp, /source=alert&alertId=/);
  assert.match(fp, /Open in Ask Aladdin/);
  assert.match(fp, /alertType=/);
  assert.match(ws, /attachedContextChip/);
  assert.doesNotMatch(ws, /if\(question\)ask\(/);
});
test("alert severity visuals and change labels are data-driven", () => {
  const fp = read("app/components/intelligence/FeaturePage.tsx");
  assert.match(fp, /alertDot/);
  assert.match(fp, /"High signal" \? a\.signal/);
  assert.match(fp, /timeAgo\(a\.time\)/);
});