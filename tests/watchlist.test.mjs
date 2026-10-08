import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("live token page offers a watchlist star beside the market data",()=>{
  const page=read("app/live/[id]/page.tsx");
  assert.match(page,/import \{WatchlistStar\} from "\@\/app\/components\/token\/WatchlistStar"/);
  assert.match(page,/<WatchlistStar/);
  assert.match(page,/token=\{\{/);
  assert.match(page,/mint,/);
  assert.match(page,/symbol: token\.symbol/);
  assert.match(page,/marketCapUsd: token\.marketCapUsd/);
});

test("star is thin when not saved and bold when saved",()=>{
  const star=read("app/components/token/WatchlistStar.tsx");
  assert.match(star,/fill=\{watched \? "currentColor" : "none"\}/);
  assert.match(star,/strokeWidth=\{watched \? 2\.5 : 1\.5\}/);
  assert.match(star,/aria-pressed=\{watched\}/);
  assert.match(star,/<Star/);
});

test("add and remove confirm with a popup message",()=>{
  const star=read("app/components/token/WatchlistStar.tsx");
  assert.match(star,/toast\("Added to watchlist"\)/);
  assert.match(star,/toast\("Removed from watchlist"\)/);
  assert.match(star,/Could not remove from watchlist/);
  assert.match(star,/Could not add to watchlist/);
  assert.match(star,/"error"/);
  const layout=read("app/layout.tsx");
  assert.match(layout,/ToastHost/);
  const host=read("app/components/ui/ToastHost.tsx");
  assert.match(host,/subscribeToasts/);
});

test("signed-out visitors get the sign-in modal instead of a silent 401",()=>{
  const star=read("app/components/token/WatchlistStar.tsx");
  assert.match(star,/if \(!user\)/);
  assert.match(star,/setEntryOpen\(true\)/);
  assert.match(star,/<EntryModal/);
});

test("watchlist data lives in one shared provider mounted in the layout",()=>{
  const ctx=read("app/contexts/WatchlistContext.tsx");
  assert.match(ctx,/\/api\/watchlist/);
  assert.match(ctx,/method: "POST"/);
  assert.match(ctx,/method: "DELETE"/);
  assert.match(ctx,/WatchlistProvider/);
  const layout=read("app/layout.tsx");
  assert.match(layout,/<WatchlistProvider>/);
  assert.match(layout,/"\.\/watchlist\.css"/);
  const pkg=JSON.parse(read("package.json"));
  assert.match(pkg.scripts.test,/watchlist\.test\.mjs/);
});

test("watchlist page renders saved tokens with live stats and links to the terminal",()=>{
  const page=read("app/watchlist/page.tsx");
  assert.match(page,/WatchlistExperience/);
  const exp=read("app/components/watchlist/WatchlistExperience.tsx");
  assert.match(exp,/useWatchlist/);
  assert.match(exp,/href=\{`\/live\/\$\{item\.mint\}`\}/);
  assert.match(exp,/<WatchlistStar token=\{item\}/);
  assert.match(exp,/money\(item\.marketCapUsd\)/);
  assert.match(exp,/pct\(item\.priceChange24h\)/);
  assert.match(exp,/priceLabel\(item\.priceUsd\)/);
  assert.match(exp,/Your watchlist is empty/);
  assert.match(exp,/Sign in to use your watchlist/);
  assert.match(exp,/refresh\(\)/);
});
