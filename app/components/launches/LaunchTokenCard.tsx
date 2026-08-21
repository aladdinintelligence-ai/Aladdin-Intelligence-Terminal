"use client";
import Link from "next/link";
import {Bolt,Sparkles} from "lucide-react";
import type {LaunchToken} from "@/app/types/launches";
import {ageLabel,countCompact,moneyCompact,volumeChange,volumeWindow} from "@/app/utils/launches";
import {SyntheticTokenImage} from "@/app/components/launches/SyntheticTokenImage";

export function LaunchTokenCard({token,onBuy}:{token:LaunchToken;onBuy:(token:LaunchToken)=>void}){
  const change=volumeChange(token);
  return <article className={`launchTokenCard lifecycle-${token.lifecycle}`}>
    <header className="launchCardIdentity">
      <Link href={`/live/${token.mint}`} aria-label={`Open ${token.symbol} in Terminal`}><SyntheticTokenImage id={token.id} symbol={token.symbol} color={token.color} lifecycle={token.lifecycle} variant="card"/></Link>
      <Link href={`/live/${token.mint}`}><strong>${token.symbol}</strong><span>{token.name}</span></Link>
      <div>{token.lifecycle==="migrated"?<><b>MIGRATED</b><span>{ageLabel(token.migratedMinutesAgo??0)} ago</span></>:<span>{ageLabel(token.ageMinutes)}</span>}</div>
    </header>
    <div className="launchMarketGrid">
      <Metric label="MC" value={moneyCompact(token.marketCap)}/>
      <Metric label="LIQ" value={moneyCompact(token.liquidity)}/>
      <div className="launchMetric"><small>VOL</small><b>{moneyCompact(token.volume)} <span>· {volumeWindow(token)}</span>{change!==null&&<em className={change>=0?"volumeUp":"volumeDown"}>{change>=0?"â†‘":"â†“"}{Math.abs(change)}%</em>}</b></div>
    </div>
    {token.lifecycle!=="migrated"&&token.bondingProgress!==null?<div className="launchLifecycle"><span><b>Bonding</b>{token.bondingProgress}%</span><div><i style={{width:`${token.bondingProgress}%`}}/></div></div>:<div className="launchPostMigration"><span>Holders <b>{token.holders===null?"Unavailable":countCompact(token.holders)}</b></span><span>TX <b>{token.transactions===null?"Unavailable":countCompact(token.transactions)}</b></span></div>}
    <div className="launchBehaviours" aria-label="Participant composition">
      <Behaviour code="MS" count={token.participants.migrationSpecialists} title="Migration Specialists"/>
      <Behaviour code="FW" count={token.participants.freshWallets} title="Fresh Wallets"/>
      <Behaviour code="SC" count={token.participants.scalpers} title="Scalpers"/>
      <Behaviour code="UN" count={token.participants.unknown} title="Unknown"/>
    </div>
    <footer className="launchCardActions">
      <button type="button" onClick={()=>onBuy(token)}><Bolt size={13}/>Buy</button>
      <Link href={`/ask-aladdin?context=token:${encodeURIComponent(token.id)}&label=${encodeURIComponent(`$${token.symbol}`)}&mint=${encodeURIComponent(token.mint)}&autorun=token`}><Sparkles size={13}/>Ask Aladdin</Link>
    </footer>
  </article>
}

function Metric({label,value}:{label:string;value:string}){return <div className="launchMetric"><small>{label}</small><b>{value}</b></div>}
function Behaviour({code,count,title}:{code:"MS"|"FW"|"SC"|"UN";count:number;title:string}){return <span className={`behaviour-${code.toLowerCase()}`} title={`${title}: ${count}`}><b>{code}</b>{count}</span>}
