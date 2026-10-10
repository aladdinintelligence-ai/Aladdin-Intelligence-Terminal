"use client";
import {useEffect,useState} from "react";
import type {InvestigationRunState} from "@/app/types/analytics/query";
import {LongAnalysisProgress} from "./LongAnalysisProgress";

export function InvestigationActivity({run}:{run:InvestigationRunState;resultCount?:number}){
 const [elapsed,setElapsed]=useState(1);
 useEffect(()=>{if(run.status!=="running"){setElapsed(1);return}const started=run.startedAt?new Date(run.startedAt).getTime():Date.now(),update=()=>setElapsed(Math.max(1,Math.floor((Date.now()-started)/1000)+1));update();const timer=window.setInterval(update,1000);return()=>window.clearInterval(timer)},[run.startedAt,run.status]);
 if(run.depth==="deep")return <LongAnalysisProgress run={run}/>;
 if(run.status==="idle")return null;
 const current=run.events.at(-1);
 if(run.status==="running")return <div className="investigationActivity active" role="status" aria-live="polite"><span className="activityDotGrid" aria-hidden="true">{Array.from({length:9},(_,index)=><i key={index}/>)}</span><p>{current?.message||"Thinking"} <span>· {elapsed}s</span></p></div>;
 if(run.status==="error")return <div className="investigationActivity error" role="alert"><p>{run.errorMessage||"The investigation could not be completed."}</p></div>;
 return null;
}
