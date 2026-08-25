"use client";
import {useState} from "react";
import Link from "next/link";
import {useTokenDetail,type Trade,type Participant,type Holder,type FirstBuyer,type TokenStats} from "@/app/hooks/useTokenDetail";
import {Skeleton} from "@/app/components/ui/Skeleton";
import {Badge} from "@/app/components/ui/Badge";
import "@/app/components/ui/skeleton.css";

const TABS=["Trades","Participants","Most Profitable","Largest Holders","First 100","Holders","Live State","Historical Match"] as const;
type Tab=(typeof TABS)[number];
const DESCRIPTIONS:Record<Tab,string>={
  Trades:"Recent on-chain buy/sell transactions for this token.",
  Participants:"Wallets actively trading this token, ranked by volume.",
  "Most Profitable":"Top wallets by estimated profit from this token.",
  "Largest Holders":"Wallets holding the largest share of supply.",
  "First 100":"The first 100 wallets to buy this token.",
  Holders:"Current holder distribution and concentration.",
  "Live State":"Key metrics and current formation state.",
  "Historical Match":"Similar historical tokens and their outcomes.",
};

// Accepts null/undefined/NaN because upstream data (useTokenDetail) doesn't
// always populate every numeric field despite the types claiming `number` —
// falling through to toLocaleString() on undefined is what was crashing the
// whole panel. Every call site below passes fields that can be missing
// (t.priceUsd, p.totalVolumeUsd, b.amountUsd, s.volume24h, s.volume1h), so
// this needs to degrade to "—" rather than throw.
function fmtPrice(v:number|null|undefined):string{
  if(v==null||Number.isNaN(v))return"—";
  if(v===0)return"$0";
  if(v<0.000001)return`$${v.toFixed(10)}`;
  if(v<0.01)return`$${v.toFixed(8)}`;
  if(v<1)return`$${v.toFixed(4)}`;
  return`$${v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}

function fmtTime(iso:string):string{
  if(!iso)return"—";
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))return"—";
  return`${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}:${d.getSeconds().toString().padStart(2,"0")}`;
}

function TableSkeleton({rows=5,cols=5}:{rows?:number;cols?:number}){
  return <div className="terminalEvidenceTable">
    <div className="terminalEvidenceHead" role="row">
      {Array.from({length:cols},(_,i)=><span key={i}><Skeleton className="skeleton-text-sm"/></span>)}
    </div>
    {Array.from({length:rows},(_,r)=>(
      <div className="terminalEvidenceRow" role="row" key={r}>
        {Array.from({length:cols},(_,c)=>(
          <span key={c}><Skeleton className="skeleton-text" count={1}/></span>
        ))}
      </div>
    ))}
  </div>;
}

function TradesPanel({data,loading,error}:{data:Trade[]|null;loading:boolean;error:string|null}){
  if(loading)return <TableSkeleton rows={8} cols={6}/>;
  if(error)return <div className="launchEmpty"><b>Error</b><span>{error}</span></div>;
  if(!data?.length)return <div className="launchEmpty"><b>No trades found</b></div>;

  return <div className="terminalEvidenceTable">
    <div className="terminalEvidenceHead" role="row">
      <span>TIME</span><span>SIDE</span><span>AMOUNT</span><span>PRICE</span><span>VALUE</span><span>SIGNATURE</span>
    </div>
    {data.map((t,i)=>(
      <div className="terminalEvidenceRow" role="row" key={i}>
        <span>{fmtTime(t.time)}</span>
        <span><Badge color={t.side==="BUY"?"#22c55e":"#ef4444"}>{t.side}</Badge></span>
        <span>{t.amount!=null&&!Number.isNaN(t.amount)?t.amount.toFixed(4):"—"}</span>
        <span>{fmtPrice(t.priceUsd)}</span>
        <span>{fmtPrice(t.amount!=null&&t.priceUsd!=null?t.amount*t.priceUsd:null)}</span>
        <span>{t.signature?<a href={`https://solscan.io/tx/${t.signature}`} target="_blank" rel="noreferrer" style={{color:"var(--purple-readable)"}}>{t.signature.slice(0,8)}...</a>:"—"}</span>
      </div>
    ))}
  </div>;
}

function ParticipantsPanel({data,loading,error}:{data:Participant[]|null;loading:boolean;error:string|null}){
  if(loading)return <TableSkeleton rows={8} cols={6}/>;
  if(error)return <div className="launchEmpty"><b>Error</b><span>{error}</span></div>;
  if(!data?.length)return <div className="launchEmpty"><b>No participants found</b></div>;

  return <div className="terminalEvidenceTable">
    <div className="terminalEvidenceHead" role="row">
      <span>WALLET</span><span>TRADES</span><span>BUYS</span><span>SELLS</span><span>VOLUME</span><span>BEHAVIOUR</span>
    </div>
    {data.map((p,i)=>(
      <div className="terminalEvidenceRow" role="row" key={i}>
        <span style={{fontFamily:"var(--font-mono)"}}>{p.short}</span>
        <span>{p.trades??"—"}</span>
        <span style={{color:"#22c55e"}}>{p.buys??"—"}</span>
        <span style={{color:"#ef4444"}}>{p.sells??"—"}</span>
        <span>{fmtPrice(p.totalVolumeUsd)}</span>
        <span><Badge color={p.behaviour==="Buyer"?"#22c55e":p.behaviour==="Seller"?"#ef4444":"#a78bfa"}>{p.behaviour}</Badge></span>
      </div>
    ))}
  </div>;
}

function HoldersPanel({data,loading,error}:{data:Holder[]|null;loading:boolean;error:string|null}){
  if(loading)return <TableSkeleton rows={8} cols={4}/>;
  if(error)return <div className="launchEmpty"><b>Error</b><span>{error}</span></div>;
  if(!data?.length)return <div className="launchEmpty"><b>No holders found</b></div>;

  return <div className="terminalEvidenceTable">
    <div className="terminalEvidenceHead" role="row">
      <span>RANK</span><span>WALLET</span><span>BALANCE</span><span>SUPPLY %</span>
    </div>
    {data.map((h,i)=>(
      <div className="terminalEvidenceRow" role="row" key={i}>
        <span>#{h.rank}</span>
        <span style={{fontFamily:"var(--font-mono)"}}>{h.short}</span>
        <span>{h.balance!=null&&!Number.isNaN(h.balance)?h.balance.toLocaleString():"—"}</span>
        <span>{h.supplyPct!=null?`${h.supplyPct}%`:"—"}</span>
      </div>
    ))}
  </div>;
}

function FirstBuyersPanel({data,loading,error}:{data:FirstBuyer[]|null;loading:boolean;error:string|null}){
  if(loading)return <TableSkeleton rows={8} cols={4}/>;
  if(error)return <div className="launchEmpty"><b>Error</b><span>{error}</span></div>;
  if(!data?.length)return <div className="launchEmpty"><b>No first buyers found</b></div>;

  return <div className="terminalEvidenceTable">
    <div className="terminalEvidenceHead" role="row">
      <span>RANK</span><span>WALLET</span><span>FIRST BUY</span><span>AMOUNT</span>
    </div>
    {data.map((b,i)=>(
      <div className="terminalEvidenceRow" role="row" key={i}>
        <span>#{b.rank}</span>
        <span style={{fontFamily:"var(--font-mono)"}}>{b.short}</span>
        <span>{fmtTime(b.firstBuyTime)}</span>
        <span>{fmtPrice(b.amountUsd)}</span>
      </div>
    ))}
  </div>;
}

function LiveStatePanel({mint}:{mint:string}){
  const{data,loading,error}=useTokenDetail(mint,"stats");
  if(loading)return <TableSkeleton rows={4} cols={2}/>;
  if(error)return <div className="launchEmpty"><b>Error</b><span>{error}</span></div>;
  const s=data as TokenStats|null;
  if(!s)return <div className="launchEmpty"><b>No data</b></div>;

  return <div className="terminalEvidenceTable">
    <div className="terminalEvidenceHead" role="row"><span>METRIC</span><span>VALUE</span></div>
    <div className="terminalEvidenceRow" role="row"><span>Trades (24h)</span><span>{s.trades24h?.toLocaleString()??"—"}</span></div>
    <div className="terminalEvidenceRow" role="row"><span>Volume (24h)</span><span>{fmtPrice(s.volume24h)}</span></div>
    <div className="terminalEvidenceRow" role="row"><span>Trades (1h)</span><span>{s.trades1h?.toLocaleString()??"—"}</span></div>
    <div className="terminalEvidenceRow" role="row"><span>Volume (1h)</span><span>{fmtPrice(s.volume1h)}</span></div>
    <div className="terminalEvidenceRow" role="row"><span>Buy/Sell Ratio (24h)</span><span style={{color:(s.buys24h??0)>=(s.sells24h??0)?"#22c55e":"#ef4444"}}>{s.buys24h!=null&&s.sells24h!=null?(s.sells24h>0?(s.buys24h/s.sells24h).toFixed(2):"∞"):"—"}</span></div>
    <div className="terminalEvidenceRow" role="row"><span>Holders</span><span>{s.holders?.toLocaleString()??"—"}</span></div>
    <div className="terminalEvidenceRow" role="row"><span>Top 10 Concentration</span><span>{s.top10Pct!=null?`${s.top10Pct}%`:"—"}</span></div>
  </div>;
}

export function TerminalInvestigation({mint,symbol,initialView="Trades"}:{mint:string;symbol:string;initialView?:string}){
  const validInitial=TABS.includes(initialView as Tab)?initialView as Tab:"Trades";
  const[active,setActive]=useState<Tab>(validInitial);

  const tabParam=active==="Most Profitable"?"participants":active==="Largest Holders"?"holders":active==="First 100"?"first-buyers":active==="Live State"?"stats":active==="Historical Match"?"trades":active.toLowerCase();
  const{data,loading,error}=useTokenDetail(mint,tabParam);

  return <div className="investigate">
    <div className="tabs" role="tablist" aria-label="Terminal evidence views">
      {TABS.map(tab=><button type="button" role="tab" aria-selected={active===tab} className={active===tab?"active":""} onClick={()=>setActive(tab)} key={tab}>{tab}</button>)}
    </div>
    <div className="tableHeading">
      <div>
        <h2>{active}</h2>
        <p>{DESCRIPTIONS[active]}</p>
      </div>
      <Link href={`/ask-aladdin?context=token:${mint}&label=${encodeURIComponent(`$${symbol}`)}`}>Ask Aladdin about ${symbol} {"\u2192"}</Link>
    </div>

    {active==="Trades"&&<TradesPanel data={data as Trade[]|null} loading={loading} error={error}/>}
    {active==="Participants"&&<ParticipantsPanel data={data as Participant[]|null} loading={loading} error={error}/>}
    {active==="Holders"&&<HoldersPanel data={data as Holder[]|null} loading={loading} error={error}/>}
    {active==="First 100"&&<FirstBuyersPanel data={data as FirstBuyer[]|null} loading={loading} error={error}/>}
    {active==="Live State"&&<LiveStatePanel mint={mint}/>}
    {active==="Most Profitable"&&<ParticipantsPanel data={data as Participant[]|null} loading={loading} error={error}/>}
    {active==="Largest Holders"&&<HoldersPanel data={data as Holder[]|null} loading={loading} error={error}/>}
    {active==="Historical Match"&&<div className="launchEmpty"><b>Coming soon</b><span>Historical pattern matching will be available after token sync.</span></div>}
  </div>;
}