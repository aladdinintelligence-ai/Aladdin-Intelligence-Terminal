"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Wifi} from "lucide-react";
import {useLaunches} from "@/app/hooks/useLaunches";
import {Skeleton} from "@/app/components/ui/Skeleton";
import "@/app/components/ui/skeleton.css";

function useSolPrice() {
  const [price, setPrice] = useState<number | null>(180);

  useEffect(() => {
    let active = true;

    const fetch_ = async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
        );

        if (!res.ok) {
          if (active) setPrice(180);
          return;
        }

        const data = await res.json();
        const solPrice = data?.solana?.usd;

        if (active) {
          setPrice(
            typeof solPrice === "number" && solPrice > 0
              ? solPrice
              : 90
          );
        }
      } catch {
        if (active) setPrice(90);
      }
    };

    fetch_();

    const i = setInterval(fetch_, 30000);

    return () => {
      active = false;
      clearInterval(i);
    };
  }, []);

  return price;
}




function useRpcStats(){
  const[latency,setLatency]=useState<number|null>(null);
  const[blockTime,setBlockTime]=useState<string>("--");
const rpcUrl=useRef(process.env.NEXT_PUBLIC_SOLANA_RPC_URL||"");
 useEffect(()=>{
  let active=true;
  const measure=async()=>{
   if(!rpcUrl.current)return;
   try{
    const start=performance.now();
    const res=await fetch(rpcUrl.current,{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getSlot",params:[]}),
    });
    const ms=Math.round(performance.now()-start);
    if(!active)return;
    setLatency(ms);
    const data=await res.json();
    if(data.result!=null){
     const now=new Date();
     setBlockTime(`${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}:${now.getSeconds().toString().padStart(2,"0")}`);
    }
   }catch{}
  };
  measure();
  const i=setInterval(measure,10000);
  return()=>{active=false;clearInterval(i)};
 },[]);
  return{latency,blockTime};
}
function useTime(){
  const[time,setTime]=useState("");
  useEffect(()=>{
    const f=()=>setTime(new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false,timeZone:"Europe/London"}).format(new Date()));
    f();
    const i=setInterval(f,1000);
    return()=>clearInterval(i);
  },[]);
  return time;
}

export function TopBar({showMarketData=true}:{showMarketData?:boolean}){
  const time=useTime();
  const solPrice=useSolPrice();
  const{latency,blockTime}=useRpcStats();
  const{tokens:launchTokens,loading}=useLaunches("Trending");

  if(!showMarketData)return null;

  return<>
    <header className="topbar">
      <b>{time}<em> LDN</em></b>
      <span className="live"><i/>SOLANA · LIVE</span>
      <span>SOL <strong>{solPrice!==null?`$${solPrice.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`:<Skeleton className="skeleton-text" count={1}/>}</strong></span>
      <span>RPC <strong>{latency!==null?`${latency}ms`:<Skeleton className="skeleton-text-sm" count={1}/>}</strong></span>
      <span>BLOCK <strong>{blockTime!=="--"? blockTime: "--"}</strong></span>
      <span className="systemMode">BEHAVIOUR BEFORE PRICE</span>
      <Wifi size={14} color="#33d6a6"/>
    </header>
    <div className="ticker">
      <div>
        {loading?
          Array.from({length:6},(_,i)=><span key={i} className="tickerItem"><Skeleton className="skeleton-text" count={1}/></span>):
          [...launchTokens,...launchTokens].map((t,i)=>(
            <Link key={i} href={`/live/${t.mint}`}>
              <b>{t.lifecycle==="migrated"?"MIGRATED":t.lifecycle==="almost-bonded"?"MIGRATING":"NEW"}</b> · ${t.symbol} · MC {t.marketCap>=1e6?`$${(t.marketCap/1e6).toFixed(1)}M`:`$${(t.marketCap/1e3).toFixed(0)}K`}
            </Link>
          ))
        }
      </div>
    </div>
  </>;
}
