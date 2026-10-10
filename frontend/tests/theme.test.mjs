import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("Settings is the only user-facing theme owner",()=>{
  const settings=read("app/settings/page.tsx");
  const ask=read("app/components/ask-aladdin/AskWorkspace.tsx");
  assert.match(settings,/useTheme/);
  assert.match(settings,/Dark/);
  assert.match(settings,/Light/);
  assert.match(settings,/System/);
  assert.doesNotMatch(settings,/Coming soon/);
  assert.doesNotMatch(ask,/ThemeControl|aria-label="Theme"/);
  assert.equal(fs.existsSync(path.join(root,"app/components/ask-aladdin/ThemeControl.tsx")),false);
});

test("global preference persists and system follows live device changes",()=>{
  const provider=read("app/components/theme/ThemeProvider.tsx");
  for(const value of ["dark","light","system"])assert.match(provider,new RegExp(`value===\\"${value}\\"|value=\\"${value}\\"|\\"${value}\\"`));
  assert.match(provider,/localStorage\.setItem\(THEME_STORAGE_KEY,value\)/);
  assert.match(provider,/prefers-color-scheme: dark/);
  assert.match(provider,/addEventListener\("change",onChange\)/);
  assert.match(provider,/removeEventListener\("change",onChange\)/);
});

test("first-render script resolves persisted preference before application content",()=>{
  const layout=read("app/layout.tsx");
  assert.match(layout,/themeBoot/);
  assert.match(layout,/localStorage\.getItem/);
  assert.match(layout,/data-resolved-theme/);
  assert.match(layout,/<head><script dangerouslySetInnerHTML/);
  assert.match(layout,/suppressHydrationWarning/);
});

test("semantic tokens cover ordinary, selected, disabled and evidence states",()=>{
  const css=read("app/theme.css");
  for(const token of ["page-bg","surface-elevated","surface-brand-dark","text-primary","text-secondary","text-metadata","text-inverse","border-strong","input-bg","mobile-nav-bg","focus-ring","disabled-surface","hover-surface","selected-surface","positive","negative","warning","infrastructure"])assert.match(css,new RegExp(`--${token}:`));
  assert.match(css,/data-resolved-theme="light"/);
  assert.match(css,/mobileDock/);
  assert.match(css,/narrativeCard/);
  assert.match(css,/terminalEvidenceHead/);
  assert.match(css,/Deliberate branded\/terminal-dark surfaces/);
});

test("legacy route styles no longer own theme resolution",()=>{
  const workspace=read("app/workspace.css");
  const service=read("app/services/workspace-local.ts");
  assert.doesNotMatch(workspace,/data-theme=light|prefers-color-scheme/);
  assert.doesNotMatch(service,/loadTheme|applyTheme|THEME=/);
});
