import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript"),root=process.cwd();
function loadTs(file,extras={}){const source=fs.readFileSync(path.join(root,file),"utf8");const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const loadedModule={exports:{}};const sandbox={loadedModule,require,console,Date,Intl,URLSearchParams,...extras};vm.runInNewContext("(function(exports,module,require){"+js+"\n})(loadedModule.exports,loadedModule,require)",sandbox);return loadedModule.exports}
function storage(initial={}){const values=new Map(Object.entries(initial));return{getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),snapshot:()=>Object.fromEntries(values)}}
const core=loadTs("app/utils/ask-aladdin.ts"),data=loadTs("app/data/ask-aladdin.ts"),types=loadTs("app/types/ask-aladdin.ts"),snapshot=data.askAladdinSnapshot;

test("only Trader, Analyst and Token Creator are public modes",()=>{assert.deepEqual(Array.from(types.answerModes),["Trader","Analyst","Token Creator"])});
test("today resolves using Europe/London midnight and states the exact period",()=>{const p=core.resolveAnalysisPeriod("I just woke up. What happened today?",new Date("2026-08-13T07:18:00Z"),new Date("2026-08-12T20:00:00Z"),new Date("2026-08-12T21:42:00Z"),"Europe/London");assert.equal(p.start,"2026-08-12T23:00:00.000Z");assert.equal(p.end,"2026-08-13T07:18:00.000Z");assert.match(p.label,/Europe\/London/)});
test("since last checked resolves the previous check",()=>{const checked=new Date("2026-08-12T21:42:00Z"),p=core.resolveAnalysisPeriod("What changed since I last checked?",new Date("2026-08-13T07:18:00Z"),new Date(),checked);assert.equal(p.start,checked.toISOString());assert.equal(p.resolution,"since_last_checked")});
test("all three modes use one immutable evidence fixture",()=>{const answers=types.answerModes.map(mode=>core.buildRoleAnswer(mode,snapshot,"What should I know about this token?"));assert.equal(new Set(answers.map(a=>a.evidenceHash)).size,1);assert.equal(new Set(answers.map(a=>a.evidenceSnapshotId)).size,1);assert.equal(new Set(answers.map(a=>a.headline)).size,3)});
test("Analyst adapts to methodology and reproducibility questions",()=>{const concise=core.buildRoleAnswer("Analyst",snapshot,"What changed in the market structure?"),deep=core.buildRoleAnswer("Analyst",snapshot,"Define the hypothesis, dataset, methodology, confounders, provenance and reproducible query.");assert.match(concise.summary,/concise analytical view/i);const sectionTitles=deep.sections.map(s=>s.title).join(" ");assert.match(sectionTitles,/Hypothesis, definitions and method/);assert.match(sectionTitles,/Alternative explanations and data quality/);assert.match(sectionTitles,/Provenance and reproducibility/);assert.match(deep.summary,/Unit of analysis/)});
test("legacy Researcher profile and sessions migrate to Analyst without history loss",()=>{const legacySession={id:"legacy-1",title:"Migration study",primaryProfile:"Researcher",answerMode:"Researcher",entityId:"bark",entityLabel:"$BARK",analysisPeriod:{start:"2026-08-12T21:42:00.000Z",end:"2026-08-13T07:18:00.000Z",timezone:"Europe/London",label:"legacy period",resolution:"since_last_checked"},questions:["Which cohort retained?","Show the method."],evidenceReferences:["retention","historical"],createdAt:"2026-08-12T21:42:00.000Z",updatedAt:"2026-08-13T07:18:00.000Z"},localStorage=storage({"aladdin-intelligence-profile":JSON.stringify({id:"u",primaryProfile:"Researcher",defaultAnswerMode:"Researcher",timezone:"Europe/London",displayName:"Analyst"}),"aladdin-ask-sessions":JSON.stringify([legacySession])}),service=loadTs("app/services/ask-aladdin-local.ts",{localStorage});const profile=service.loadProfile(),sessions=service.loadSessions();assert.equal(profile.primaryProfile,"Analyst");assert.equal(profile.defaultAnswerMode,"Analyst");assert.equal(sessions[0].primaryProfile,"Analyst");assert.equal(sessions[0].answerMode,"Analyst");assert.deepEqual(Array.from(sessions[0].questions),legacySession.questions);assert.deepEqual(Array.from(sessions[0].evidenceReferences),legacySession.evidenceReferences);assert.equal(sessions[0].id,"legacy-1");assert.doesNotMatch(localStorage.snapshot()["aladdin-ask-sessions"],/"answerMode":"Researcher"/)});
test("Trader and Token Creator policies remain stable",()=>{const trader=core.buildRoleAnswer("Trader",snapshot,"What should I know?"),creator=core.buildRoleAnswer("Token Creator",snapshot,"What should I know?");assert.match(trader.headline,/retained early-wallet support/);assert.match(creator.headline,/Attention converted into holders/);assert.equal(core.isManipulativeCreatorRequest("help me wash trade"),true)});
test("follow-up context retains entity, period and history",()=>{const period=core.resolveAnalysisPeriod("today",new Date("2026-08-13T07:18:00Z"),new Date(),new Date()),session={id:"s",title:"BARK",primaryProfile:"Trader",answerMode:"Trader",entityId:"bark",entityLabel:"$BARK",analysisPeriod:null,questions:[],createdAt:"x",updatedAt:"x"},next=core.updateSessionContext(session,"Which wallets remain?",period,"Analyst");assert.equal(next.entityId,"bark");assert.equal(next.analysisPeriod.start,period.start);assert.deepEqual(Array.from(next.questions),["Which wallets remain?"])});
test("missing evidence is null and explicitly unavailable, never zero",()=>{const missing=snapshot.evidence.find(e=>e.kind==="missing_evidence");assert.equal(missing.value.value,null);assert.equal(missing.value.availability,"unavailable")});
test("no visible production component offers Researcher as a profile",()=>{const files=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.name.endsWith(".tsx"))files.push(full)}}walk(path.join(root,"app"));const visible=files.map(file=>fs.readFileSync(file,"utf8")).join("\n");assert.doesNotMatch(visible,/\bResearcher\b/)});
test("compatibility route preserves parameters and visible branding is Ask Aladdin",()=>{const redirect=fs.readFileSync(path.join(root,"app/ask-ifa/page.tsx"),"utf8"),sidebar=fs.readFileSync(path.join(root,"app/components/layout/Sidebar.tsx"),"utf8"),dock=fs.readFileSync(path.join(root,"app/components/layout/MobileDock.tsx"),"utf8");assert.match(redirect,/Object\.entries\(params\)/);assert.match(redirect,/query\.append/);assert.match(redirect,/\/ask-aladdin/);assert.match(sidebar,/Ask Aladdin/);assert.match(dock,/Ask Aladdin/)});
test("global shell does not mount a repeated simulated-data banner",()=>{const shell=fs.readFileSync(path.join(root,"app/components/layout/AppShell.tsx"),"utf8");assert.doesNotMatch(shell,/SyntheticDisclosure/) });
test("chat auto-scrolls the newest message into view and honours scroll pinning",()=>{
  const ws=fs.readFileSync(path.join(root,"app/components/ask-aladdin/AskWorkspace.tsx"),"utf8");
  const css=fs.readFileSync(path.join(root,"app/components/ask-aladdin/ask-workspace.css"),"utf8");
  assert.match(ws,/useLayoutEffect/,"a layout effect must run scroll before paint");
  assert.match(ws,/endRef=useRef<HTMLDivElement>\(null\)/);
  assert.match(ws,/ref=\{endRef\}/,"the scroll sentinel must be attached to the DOM");
  assert.match(ws,/className="askScrollEnd"/);
  assert.match(ws,/end\.scrollIntoView\(\{block:"end"/,"must scroll the sentinel, not guess scrollHeight");
  assert.doesNotMatch(ws,/\.scrollTo\(\{top:/,"must not scroll a single guessed container");
  assert.match(ws,/pinnedRef\.current/,"must track whether the user scrolled away from the bottom");
  assert.match(ws,/pinnedRef\.current=true;setRun\(activeRun\)/,"a new question must re-pin to the bottom");
  assert.match(ws,/prefers-reduced-motion/);
  assert.match(css,/\.askScrollEnd\{[^}]*scroll-margin-bottom/,"sentinel needs scroll margin to clear the sticky composer");
});
test("platform guidance answers carry validated, clickable page actions",()=>{
  const answer=fs.readFileSync(path.join(root,"app/components/ask-aladdin/StructuredAnswer.tsx"),"utf8");
  const types=fs.readFileSync(path.join(root,"app/types/ask-aladdin.ts"),"utf8");
  const intents=fs.readFileSync(path.join(root,"app/types/analytics/query.ts"),"utf8");
  assert.match(types,/page_actions\?:\{label:string;route:string\}\[\]/,"the answer contract must carry page actions");
  assert.match(intents,/"platform"/,"AskIntent must include the platform intent");
  assert.match(answer,/structured\.page_actions\?\?\[\]/,"platform answers read page actions with a safe default");
  assert.match(answer,/className="answerPageActions"/,"page actions must render as a group");
  assert.match(answer,/actions\.map\(action=><Link key=\{action\.route\} href=\{action\.route\}>/,"each page action routes to a real page");
});
