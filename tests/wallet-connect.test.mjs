import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("landing separates account entry demo access and real wallet connection",()=>{
  const page=read("app/page.tsx"),entry=read("app/components/landing/EntryModal.tsx");
  assert.match(page,/Launch Aladdin/);assert.match(page,/Explore Demo/);
  assert.match(entry,/Continue with Google/);assert.match(entry,/Continue with Telegram/);
  assert.match(entry,/Connect Solana Wallet/);assert.match(entry,/entryAsWallet:true/);
});
test("Solana provider uses Wallet Standard discovery on Mainnet without legacy adapters",()=>{
  const provider=read("app/providers/SolanaProvider.tsx"),pkg=JSON.parse(read("package.json"));
  assert.match(provider,/WalletProvider wallets=\{\[\]\}/);
  assert.match(provider,/NEXT_PUBLIC_SOLANA_RPC_URL/);
  // No silent fallback to the public Solana endpoint.
  assert.doesNotMatch(provider,/clusterApiUrl/);
  assert.ok(pkg.dependencies["@solana/wallet-adapter-react"]);assert.ok(pkg.dependencies["@solana/web3.js"]);
  assert.equal(pkg.dependencies["@solana/wallet-adapter-wallets"],undefined);
});
test("balance tracking subscribes over WS with an HTTP polling safety net",()=>{
  const provider=read("app/providers/SolanaProvider.tsx");
  assert.match(provider,/onAccountChange/);
  assert.match(provider,/removeAccountChangeListener/);
  assert.match(provider,/getBalance/);
  assert.match(provider,/setInterval/);
  assert.match(provider,/wsEndpoint/);
  // Wallet-adapter errors are logged with their non-enumerable code/message.
  assert.match(provider,/Object\.getOwnPropertyNames/);
});
test("entry keeps the visitor on the current page instead of forcing /launches",()=>{
  const entry=read("app/components/landing/EntryModal.tsx");
  assert.match(entry,/usePathname/);
  assert.match(entry,/pathname!=="\/"\?pathname:"\/launches"/);
  // No hardcoded post-auth destination anywhere in the modal.
  assert.doesNotMatch(entry,/router\.push\("\/launches"\)/);
  assert.doesNotMatch(entry,/afterConnectPath:"\/launches"/);
});
test("landing Launch Aladdin recognises an existing session",()=>{
  const page=read("app/page.tsx");
  assert.match(page,/useAuth/);
  // Signed-in users are sent into the product; the button waits for the session
  // check so a click cannot flash the sign-in modal at a signed-in user.
  assert.match(page,/if\(user\)\{router\.push/);
  assert.match(page,/if\(loading\)return/);
});
test("real wallet state replaces mocked address and balance",()=>{
  const account=read("app/components/account/AccountControl.tsx"),settings=read("app/settings/page.tsx");
  assert.doesNotMatch(account,/14\.82 SOL|7xK\.\.\.91Pd/);assert.match(account,/WalletBalance/);
  assert.match(account,/Disconnect Wallet/);assert.match(account,/Sign Out/);
  assert.match(settings,/ConnectedWallet/);assert.doesNotMatch(settings,/14\.82 SOL/);
});
test("intelligence stays available while execution requests a wallet",()=>{
  const launches=read("app/components/launches/LaunchesExperience.tsx");
  assert.match(launches,/if\(!wallet\.connected\)/);assert.match(launches,/openWalletModal/);
  assert.match(launches,/resume this token after connection/);
});
test("visible product terminology is Ask Aladdin and What Changed",()=>{
  const terminal=read("app/components/ifa/IfaNow.tsx"),settings=read("app/settings/page.tsx");
  assert.match(terminal,/WHAT CHANGED/);assert.doesNotMatch(terminal,/IFÁ|IFA NOW|ALADDIN NOW/);
  const api=read("app/api/page.tsx");assert.match(settings,/Aladdin Intelligence/);assert.match(api,/ASK ALADDIN API/);
});

test("no Devnet code, copy or test-transaction affordance remains in the wallet layer",()=>{
  const provider=read("app/providers/SolanaProvider.tsx"),types=read("app/types/wallet.ts"),notice=read("app/components/wallet-connect/NetworkNotice.tsx"),utils=read("app/utils/wallet.ts");
  for(const[label,src] of [["provider",provider],["types",types],["notice",notice],["utils",utils]]){
   assert.doesNotMatch(src,/devnet|Devnet|DEVNET/,`${label} still references Devnet`);
  }
  assert.doesNotMatch(provider,/SystemProgram\.transfer|sendTransaction|openDevnetTransaction|devnetTransaction/);
  assert.doesNotMatch(types,/DevnetTransactionState|devnetTransaction/);
  assert.match(notice,/Solana Mainnet connected/);
  assert.match(notice,/real SOL/);
  assert.match(utils,/MAINNET_LABEL="Solana Mainnet"/);
});
test("Mainnet notice is honest about real value and network identity",()=>{
  const notice=read("app/components/wallet-connect/NetworkNotice.tsx"),provider=read("app/providers/SolanaProvider.tsx");
  assert.match(notice,/MAINNET/);assert.match(notice,/Network &mdash; Solana Mainnet/);
  assert.doesNotMatch(notice,/no monetary value/);
  assert.match(provider,/NETWORK_NOTICE_KEY/);
  assert.match(provider,/network:"mainnet-beta"/);
});