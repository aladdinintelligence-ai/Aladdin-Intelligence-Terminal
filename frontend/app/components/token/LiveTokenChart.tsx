"use client";
import {useMemo,useState,useCallback} from "react";
import {LoaderCircle} from "lucide-react";
import type {Candle} from "@/app/hooks/useTokenChart";

const TIMEFRAMES=[
  {label:"1m",minutes:1},
  {label:"5m",minutes:5},
  {label:"15m",minutes:15},
  {label:"1h",minutes:60},
];

const CHART={width:800,height:380,padTop:20,padRight:65,padBottom:40,volHeight:60};

function fmtTime(iso:string){
  const d=new Date(iso);
  return`${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
}

function fmtPrice(v:number):string{
  if(v===0)return"0";
  if(v<0.000001)return v.toFixed(10);
  if(v<0.01)return v.toFixed(8);
  if(v<1)return v.toFixed(4);
  return v.toFixed(2);
}

function fmtVol(v:number):string{
  if(v>=1e6)return`$${(v/1e6).toFixed(1)}M`;
  if(v>=1e3)return`$${(v/1e3).toFixed(1)}K`;
  return`$${v.toFixed(0)}`;
}

export function LiveTokenChart({candles,loading,error,tf,onTfChange}:{
  candles:Candle[];
  loading:boolean;
  error:string|null;
  tf:string;
  onTfChange:(tf:string)=>void;
}){
  const[hoverIdx,setHoverIdx]=useState<number|null>(null);
  const[mouseY,setMouseY]=useState(0);

  const layout=useMemo(()=>{
    const {width,height,padTop,padRight,padBottom,volHeight}=CHART;
    const plotW=width-padRight;
    const plotH=height-padTop-padBottom;
    const volTop=height-padBottom-volHeight;

    if(!candles.length)return{
      ...CHART,plotW,plotH,volTop,
      xStep:0,min:0,max:1,volMax:1,
      yScale:()=>0,yVolScale:()=>0,
      priceTicks:[] as {val:number;y:number}[],
      timeTicks:[] as {label:string;x:number}[],
    };

    const allPrices=candles.flatMap(c=>[c.high,c.low]).filter(p=>p>0);
    const rawMax=Math.max(...allPrices);
    const rawMin=Math.min(...allPrices);
    const pad=(rawMax-rawMin)*0.08||rawMax*0.15;
    const hi=rawMax+pad;
    const lo=rawMin-pad;
    const range=hi-lo||1;
    const xStep=plotW/candles.length;
    const volMax=Math.max(...candles.map(c=>c.volume),0.01);

    const yScale=(v:number)=>padTop+(hi-v)/range*plotH;
    const yVolScale=(v:number)=>volTop+volHeight-v/volMax*volHeight;

    const tickCount=6;
    const priceTicks=Array.from({length:tickCount},(_,i)=>{
      const val=lo+range*(i/(tickCount-1));
      return{val,y:yScale(val)};
    });

    const timeStep=Math.max(1,Math.floor(candles.length/8));
    const timeTicks=candles.filter((_,i)=>i%timeStep===0).map((c,i)=>({
      label:fmtTime(c.time),
      x:i*xStep+xStep/2,
    }));

    return{
      ...CHART,plotW,plotH,volTop,
      xStep,min:lo,max:hi,volMax,
      yScale,yVolScale,
      priceTicks,timeTicks,
    };
  },[candles]);

  const handleMouseMove=useCallback((e:React.MouseEvent<SVGSVGElement>)=>{
    const rect=e.currentTarget.getBoundingClientRect();
    const svgX=(e.clientX-rect.left)/rect.width*CHART.width;
    const idx=Math.floor(svgX/layout.xStep);
    if(idx>=0&&idx<candles.length){
      setHoverIdx(idx);
      setMouseY(e.clientY-rect.top);
    }
  },[candles.length,layout.xStep]);

  if(loading){
    return <div className="traderChart" style={{display:"grid",placeItems:"center",minHeight:320}}>
      <LoaderCircle className="spin" size={24} style={{opacity:0.4}}/>
    </div>;
  }
  if(error||!candles.length){
    return <div className="traderChart" style={{display:"grid",placeItems:"center",minHeight:320,color:"var(--text-secondary)",fontSize:13}}>
      {error||"No chart data available"}
    </div>;
  }

  const hc=hoverIdx!==null?candles[hoverIdx]:null;

  return <div className="traderChart">
    <div className="chartTools">
      <div className="chartTimeframes">
        {TIMEFRAMES.map(t=><button className={tf===t.label?"active":""} onClick={()=>onTfChange(t.label)} key={t.label}>{t.label}</button>)}
      </div>
      {hc&&<div style={{marginLeft:"auto",display:"flex",gap:16,fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--font-mono)"}}>
        <span>O <b style={{color:hc.close>=hc.open?"#22c55e":"#ef4444"}}>{fmtPrice(hc.open)}</b></span>
        <span>H <b style={{color:"#22c55e"}}>{fmtPrice(hc.high)}</b></span>
        <span>L <b style={{color:"#ef4444"}}>{fmtPrice(hc.low)}</b></span>
        <span>C <b style={{color:hc.close>=hc.open?"#22c55e":"#ef4444"}}>{fmtPrice(hc.close)}</b></span>
        <span>Vol <b>{fmtVol(hc.volume)}</b></span>
      </div>}
    </div>

    <div className="candleViewport" style={{position:"relative"}}>
      <svg
        className="candleChart"
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={()=>setHoverIdx(null)}
        style={{cursor:"crosshair"}}
      >
        {/* Grid lines + price labels */}
        {layout.priceTicks.map((t,i)=>(
          <g key={i}>
            <line x1={0} x2={layout.plotW} y1={t.y} y2={t.y} stroke="var(--border)" strokeWidth={0.5} strokeDasharray={i>0?"3,3":"none"}/>
            <text x={layout.plotW+6} y={t.y+3} fill="var(--text-secondary)" fontSize={10} fontFamily="var(--font-mono)">{fmtPrice(t.val)}</text>
          </g>
        ))}

        {/* Time axis labels */}
        {layout.timeTicks.map((t,i)=>(
          <text key={i} x={t.x} y={CHART.height-8} textAnchor="middle" fill="var(--text-secondary)" fontSize={9} fontFamily="var(--font-mono)">{t.label}</text>
        ))}

        {/* Volume bars */}
        {candles.map((c,i)=>{
          const x=i*layout.xStep;
          const volH=c.volume/layout.volMax*layout.volHeight;
          const bullish=c.close>=c.open;
          return <rect key={i} x={x+1} y={layout.volTop+layout.volHeight-volH} width={Math.max(layout.xStep-2,1)} height={volH} fill={bullish?"rgba(34,197,94,0.15)":"rgba(239,68,68,0.15)"}/>;
        })}

        {/* Candle wicks + bodies */}
        {candles.map((c,i)=>{
          const x=i*layout.xStep;
          const cx=x+layout.xStep/2;
          const bullish=c.close>=c.open;

          const openY=layout.yScale(c.open);
          const closeY=layout.yScale(c.close);
          const highY=layout.yScale(c.high);
          const lowY=layout.yScale(c.low);

          const bodyTop=Math.min(openY,closeY);
          const bodyBot=Math.max(openY,closeY);
          const bodyH=Math.max(bodyBot-bodyTop,2);

          const bodyW=Math.max(Math.min(layout.xStep*0.65,14),3);

          return <g key={i}>
            {/* Wick */}
            <line x1={cx} y1={highY} x2={cx} y2={lowY} stroke={bullish?"#22c55e":"#ef4444"} strokeWidth={1.5}/>
            {/* Body */}
            <rect x={cx-bodyW/2} y={bodyTop} width={bodyW} height={bodyH} fill={bullish?"#22c55e":"#ef4444"} stroke={bullish?"#16a34a":"#dc2626"} strokeWidth={0.8} rx={1}/>
          </g>;
        })}

        {/* Crosshair */}
        {hoverIdx!==null&&(()=>{
          const cx=hoverIdx*layout.xStep+layout.xStep/2;
          const hoverY=mouseY/CHART.height*CHART.height;
          return <>
            <line x1={cx} x2={cx} y1={0} y2={CHART.height-CHART.padBottom} stroke="var(--text-secondary)" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.5}/>
            <line x1={0} x2={layout.plotW} y1={hoverY} y2={hoverY} stroke="var(--text-secondary)" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.5}/>
            {/* Current price line */}
            {hc&&<line x1={0} x2={layout.plotW} y1={layout.yScale(hc.close)} y2={layout.yScale(hc.close)} stroke={hc.close>=hc.open?"#22c55e":"#ef4444"} strokeWidth={0.8} strokeDasharray="4,2" opacity={0.7}/>}
            {/* Price tag on right */}
            {hc&&<rect x={layout.plotW+1} y={layout.yScale(hc.close)-8} width={CHART.padRight-6} height={16} fill={hc.close>=hc.open?"#22c55e":"#ef4444"} rx={2}/>}
            {hc&&<text x={layout.plotW+CHART.padRight/2} y={layout.yScale(hc.close)+4} textAnchor="middle" fill="#fff" fontSize={9} fontWeight={600} fontFamily="var(--font-mono)">{fmtPrice(hc.close)}</text>}
          </>;
        })()}
      </svg>
    </div>
  </div>;
}
