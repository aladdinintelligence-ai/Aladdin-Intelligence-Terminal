import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const fixtures=read("app/data/synthetic/launches.ts");
const utilities=read("app/utils/launches.ts");
const experience=read("app/components/launches/LaunchesExperience.tsx");
const card=read("app/components/launches/LaunchTokenCard.tsx");
const filters=read("app/components/launches/LaunchFilters.tsx");
const styles=read("app/components/launches/launches.css");
const feed=read("app/components/launches/LaunchFeedRow.tsx");
const artwork=read("app/components/launches/SyntheticTokenImage.tsx");

test("fixture coverage includes at least six tokens per lifecycle",()=>{assert.ok((fixtures.match(/lifecycle:"new"/g)??[]).length>=6);assert.ok((fixtures.match(/lifecycle:"almost-bonded"/g)??[]).length>=6);assert.ok((fixtures.match(/lifecycle:"migrated"/g)??[]).length>=6)});
test("volume windows and comparative direction are lifecycle aware",()=>{assert.match(utilities,/ageMinutes<60/);assert.match(utilities,/previousHourVolume===null/);assert.match(card,/volumeWindow\(token\)/);assert.match(card,/volumeUp/);assert.match(card,/volumeDown/)});
test("migrated cards replace bonding with holders and transactions",()=>{assert.match(card,/token\.lifecycle!=="migrated"/);assert.match(card,/Holders/);assert.match(card,/TX/);assert.doesNotMatch(card,/Bonding 100/)});
test("cards expose only Ask Aladdin and compact Buy actions",()=>{assert.match(card,/Ask Aladdin/);assert.match(card,/>Buy</);assert.doesNotMatch(card,/>Sell</);assert.doesNotMatch(card,/Star|Comment|Inspect wallets/)});
test("screener supports the acceptance preset and all four groups",()=>{for(const value of [/marketCapMin:20000/,/marketCapMax:80000/,/volumeMin:20000/,/bondingMin:70/,/migrationSpecialistsMin:3/,/sniperShareMax:10/])assert.match(utilities,value);for(const group of ["Market","Lifecycle","Behaviour","Token-specific wallet context"])assert.match(filters,new RegExp(`title="${group}"`))});
test("Launches preserves tab, filters, sort and scroll in session",()=>{for(const value of [/sessionStorage/,/scrollY/,/sort/,/filters/,/tab/])assert.match(experience,value)});
test("age formatting is precise: sub-minute tokens resolve to seconds, never 0m",()=>{
  assert.match(utilities,/minutes<1\)/);
  assert.match(utilities,/Math\.max\(1,Math\.round\(minutes\*60\)\)/);
  assert.match(utilities,/Math\.floor\(minutes\/60\)/);
  assert.match(utilities,/Math\.floor\(minutes\/1440\)/);
  for(const value of [/NaN/,/0m/])assert.doesNotMatch(card,value);
  for(const value of [/migratedMinutesAgo!=null/,/ageMinutes!=null/])assert.match(card,value);
});
test("cards and filter panel use responsive semantic theme surfaces",()=>{for(const value of [/var\(--surface\)/,/var\(--text-primary\)/,/var\(--brand-purple\)/,/@media\(max-width:760px\)/])assert.match(styles,value)});

test("mobile renders a dedicated feed row while desktop retains its card",()=>{assert.match(experience,/LaunchTokenCard/);assert.match(experience,/LaunchFeedRow/);assert.match(styles,/\.launchTokenCard\{display:none\}/);assert.match(styles,/\.launchFeedRow\{display:grid/)});
test("mobile feed preserves approved left-image and right-action geometry",()=>{assert.match(feed,/launchFeedImage/);assert.match(feed,/launchFeedBehaviour/);assert.match(feed,/onBuy\(token\)/);assert.match(feed,/launchFeedLifecycle/);assert.match(feed,/Ask Aladdin/);assert.match(feed,/Holders/);assert.match(feed,/launchFeedBond/)});
test("synthetic token artwork is deterministic and not a letter-only circle",()=>{assert.match(artwork,/tokenSeed/);assert.match(artwork,/<svg/);assert.match(artwork,/motif===/);assert.match(styles,/syntheticTokenImage-feed/)});
test("mobile feed motion is restrained and respects reduced motion",()=>{assert.match(styles,/launchFeedEnter/);assert.match(styles,/translateY\(6px\)/);assert.match(styles,/prefers-reduced-motion:reduce/);assert.match(styles,/transition:none/)});
test("fixture artwork maps every token to a bundled deterministic motif",()=>{for(const id of ["mochi","orbit","pixel","sprout","neon","crumb","squid","dust","bullz","milo-launch","quack","zen","toast","wisp","capy","jolt","nova","bark-launch","glow","rune","mew","beam","tide","void"])assert.ok(artwork.includes(id));assert.match(artwork,/TokenMotif/);assert.doesNotMatch(artwork,/https?:\/\//)});
test("fidelity states remain Launches scoped and geometry stays frozen",()=>{assert.match(styles,/launchLiveValue\.is-updated-positive/);assert.match(styles,/launchLiveValue\.is-updated-negative/);assert.match(styles,/tokenImage-almost-bonded/);assert.match(styles,/launchFeedRow:hover/);assert.match(styles,/launchFeedBehaviour>button:active/);assert.match(styles,/launchFeedLifecycle>a:active/);assert.doesNotMatch(styles,/(^|\})\s*(button|body|h1|h2|h3|p)\s*\{/m)});