"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {ExternalLink} from "lucide-react";
import {useTokenDetail,type Trade} from "@/app/hooks/useTokenDetail";
import "./live-trades.css";

const REFRESH_MS=6000;
const FLASH_MS=1300;
type SideFilter="all"|"buy"|"sell";

// Dex-screener shows significant figures rather than a fixed precision, so
// sub-cent tokens stay readable instead of collapsing to "$0.000000".
function sigPrice(v:number|null|undefined):string{
  if(v==null||!Number.isFinite(v))return"—";
  if(v===0)return"$0";
  const abs=Math.abs(v);
  if(abs>=1)return`$${v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})}`;
  if(abs>=0.0001)return`$${v.toFixed(6)}`;
  return`$${v.toPrecision(4)}`;
}

function usd(v:number|null|undefined):string{
  if(v==null||!Number.isFinite(v))return"—";
  if(Math.abs(v)>=1000)return`$${v.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  if(Math.abs(v)>=1)return`$${v.toFixed(2)}`;
  return`$${v.toPrecision(3)}`;
}

function tokens(v:number|null|undefined):string{
  if(v==null||!Number.isFinite(v))return"—";
  const abs=Math.abs(v);
  if(abs>=1e9)return`${(v/1e9).toFixed(2)}B`;
  if(abs>=1e6)return`${(v/1e6).toFixed(2)}M`;
  if(abs>=1e4)return v.toLocaleString(undefined,{maximumFractionDigits:0});
  if(abs>=1)return v.toLocaleString(undefined,{maximumFractionDigits:2});
  return v.toPrecision(4);
}

function ageLabel(iso:string,now:number):string{
  const t=Date.parse(iso);
  if(Number.isNaN(t))return"—";
  const s=Math.max(0,Math.floor((now-t)/1000));
  if(s<1)return"1s ago";
  if(s<60)return`${s}s ago`;
  const m=Math.floor(s/60);
  if(m<60)return`${m}m ago`;
  const h=Math.floor(m/60);
  if(h<24)return`${h}h ago`;
  return`${Math.floor(h/24)}d ago`;
}

function absLabel(iso:string):string{
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))return"—";
  return d.toLocaleString(undefined,{
    month:"short",day:"numeric",
    hour:"numeric",minute:"2-digit",second:"2-digit",
  });
}

function shortAddr(addr:string):string{
  if(!addr)return"—";
  return addr.length<=10?addr:`${addr.slice(0,4)}…${addr.slice(-4)}`;
}

// Stable per-wallet avatar hue so a trader's colour never changes between rows.
function hueOf(addr:string):number{
  let h=0;
  for(let i=0;i<addr.length;i++)h=(h*31+addr.charCodeAt(i))%360;
  return h;
}

function tradeKey(t:Trade,index:number):string{
  return t.signature||`${t.time}|${t.side}|${t.amount}|${t.priceUsd}|${t.wallet}|${index}`;
}

export function LiveTradesLog({mint,symbol}:{mint:string;symbol?:string}){
  const{data,loading,error}=useTokenDetail(mint,"trades",50,REFRESH_MS);
  const trades=(data as Trade[]|null)??null;
  const[side,setSide]=useState<SideFilter>("all");

  // Signatures seen in the previous snapshot; anything missing is newly arrived.
  const knownRef=useRef<Set<string>|null>(null);
  const[fresh,setFresh]=useState<Set<string>>(new Set());

  useEffect(()=>{
    if(!trades)return;
    const seen=new Set<string>();
    const added:string[]=[];
    trades.forEach((t,i)=>{
      const key=tradeKey(t,i);
      seen.add(key);
      if(knownRef.current&&!knownRef.current.has(key))added.push(key);
    });
    // Seed the baseline on first load so nothing flashes on mount.
    if(knownRef.current===null){knownRef.current=seen;return}
    knownRef.current=seen;
    if(added.length)setFresh(new Set(added));
  },[trades]);

  useEffect(()=>{
    if(!fresh.size)return;
    const t=setTimeout(()=>setFresh(new Set()),FLASH_MS);
    return () => clearTimeout(t);
  },[fresh]);

  // Drives the relative timestamps and the live indicator.
  const[tick,setTick]=useState(0);
  useEffect(()=>{
    const t=setInterval(()=>setTick(v=>v+1),1000);
    return () => clearInterval(t);
  },[]);

  const summary=useMemo(()=>{
    let buys=0,sells=0,count=0;
    for(const t of trades??[]){
      const v=(t.amount??0)*(t.priceUsd??0);
      if(t.side==="BUY")buys+=v; else sells+=v;
      count++;
    }
    return{buys,sells,count};
  },[trades]);

  // Key every row against its index in the unfiltered snapshot, so the filter
  // can never desync the keys the new-row diff is matching on.
  const rows=useMemo(()=>{
    const keyed=(trades??[]).map((t,i)=>({trade:t,key:tradeKey(t,i)}));
    return side==="all"?keyed:keyed.filter(r=>side==="buy"?r.trade.side==="BUY":r.trade.side==="SELL");
  },[trades,side]);

  const now=Date.now();
  const stale=loading||!trades;

  return <div className="tl">
    <div className="tlBar">
      <div className="tlSeg" role="group" aria-label="Filter by side">
        {([["all","All"],["buy","Buy"],["sell","Sell"]] as const).map(([value,label])=>
          <button key={value} type="button" aria-pressed={side===value} onClick={()=>setSide(value)}>{label}</button>
        )}
      </div>
      <span className="tlLive" data-stale={stale?"true":"false"}>
        <i className="tlLiveDot"/>{stale?"connecting":"live"}
      </span>
      <span className="tlSpacer"/>
      <span className="tlStat">Buys <b style={{color:"var(--tl-buy)"}}>{usd(summary.buys)}</b></span>
      <span className="tlStat">Sells <b style={{color:"var(--tl-sell)"}}>{usd(summary.sells)}</b></span>
    </div>

    {!trades
      ? <div className="tlEmpty"><b>Loading transactions</b><span>Fetching the most recent on-chain fills.</span></div>
      : rows.length===0
        ? <div className="tlEmpty"><b>No {side==="all"?"":side==="buy"?"buy":"sell"} transactions yet</b><span>New fills appear here automatically.</span></div>
        : <div className="tlScroll">
          <div className="tlGrid" style={{"--cols":7} as React.CSSProperties}>
            <div className="tlHead" role="row">
              <span>Date</span><span>Type</span>
              <span className="tlNum">USD</span>
              <span className="tlNum">{symbol||"Tokens"}</span>
              <span className="tlNum">Price</span>
              <span>Trader</span><span>Txn</span>
            </div>
            {rows.map(({trade:t,key})=>{
              const buy=t.side==="BUY";
              const value=(t.amount!=null&&t.priceUsd!=null)?t.amount*t.priceUsd:null;
              return <div
                className="tlRow"
                role="row"
                key={key}
                data-new={fresh.has(key)?"true":"false"}
                style={{"--tl-side":buy?"var(--tl-buy)":"var(--tl-sell)"} as React.CSSProperties}
              >
                <span className="tlDate">
                  <span className="tlAge">{ageLabel(t.time,now)}</span>
                  <span className="tlAbs">{absLabel(t.time)}</span>
                </span>
                <span><i className="tlSide">{buy?"Buy":"Sell"}</i></span>
                <span className="tlNum tlUsd">{usd(value)}</span>
                <span className="tlNum tlAmt">{tokens(t.amount)}</span>
                <span className="tlNum tlPrice">{sigPrice(t.priceUsd)}</span>
                <span>
                  {t.wallet
                    ? <a className="tlTrader" href={`https://solscan.io/account/${t.wallet}`} target="_blank" rel="noreferrer" title={t.wallet}>
                        <i className="tlAvatar" style={{"--hue":hueOf(t.wallet)} as React.CSSProperties}>{t.wallet.slice(0,2)}</i>
                        <span className="tlAddr">{shortAddr(t.wallet)}</span>
                      </a>
                    : <span className="tlDim">—</span>}
                </span>
                <span>
                  {t.signature
                    ? <a className="tlExt" href={`https://solscan.io/tx/${t.signature}`} target="_blank" rel="noreferrer" title={t.signature} aria-label="View transaction on Solscan"><ExternalLink size={13}/></a>
                    : <span className="tlDim">—</span>}
                </span>
              </div>;
            })}
          </div>
        </div>}
  </div>;
}