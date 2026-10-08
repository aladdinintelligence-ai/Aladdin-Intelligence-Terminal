import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const read = file => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const log = () => read("app/components/token/LiveTradesLog.tsx");
const css = () => read("app/components/token/live-trades.css");
const hook = () => read("app/hooks/useTokenDetail.ts");

test("the transactions tab renders a BEHAVIOUR column between price and trader", () => {
  const src = log();
  assert.match(src, /--cols":8/);
  assert.match(src, /<span>Behaviour<\/span>/);
  assert.match(src, /<span>Txn<\/span>/);
  const price = src.indexOf("Price");
  const behaviour = src.indexOf("<span>Behaviour</span>");
  const trader = src.indexOf("<span>Trader</span>");
  assert.ok(price < behaviour && behaviour < trader);
});

test("every trade row shows the wallet's behaviour chip with a stable kind", () => {
  const src = log();
  assert.match(src, /t\.behaviour/);
  assert.match(src, /className="tlBehav"/);
  assert.match(src, /data-kind={behavKind\(t\.behaviour\)}/);
  for (const [label, kind] of [["Creator","creator"],["Cluster Wallet","cluster"],["Scalper","scalper"],["Migration Specialist","migration"],["Fresh Wallet","fresh"],["Bundle Specialist","bundle"],["Smart Money","smart"],["Insider","insider"],["Unknown","unknown"],["Buyer","buy"],["Seller","sell"],["Mixed","mixed"]])
    assert.match(src, new RegExp(`"${label}":"${kind}"`));
});

test("the trades payload type carries the optional behaviour field", () => {
  assert.match(hook(), /behaviour\?: string/);
});

test("the tape declares 8 columns and styles the behaviour chip palette", () => {
  const styles = css();
  assert.match(styles, /--cols: \d+/);
  assert.match(styles, /--cols: 8/);
  assert.match(styles, /\.tlBehav \{/);
  assert.match(styles, /data-kind="buy"/);
  assert.match(styles, /data-kind="creator"/);
  assert.match(styles, /data-kind="cluster"/);
  assert.match(styles, /data-kind="scalper"/);
  assert.match(styles, /data-kind="migration"/);
  assert.match(styles, /data-kind="fresh"/);
  assert.match(styles, /data-kind="bundle"/);
  assert.match(styles, /data-kind="unknown"/);
});