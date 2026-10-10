"use client";
import {useEffect,useState} from "react";
import {ChevronDown} from "lucide-react";
import type {InvestigationRunState} from "@/app/types/analytics/query";

export function LongAnalysisProgress({run}:{run:InvestigationRunState}){
 const [expanded,setExpanded]=useState(run.status==="running");
 useEffect(()=>{if(run.status==="running")setExpanded(true);if(run.status==="complete")setExpanded(false)},[run.status]);
 const completed=run.events.filter(event=>event.status==="complete").length,total=run.events.length,current=run.events.find(event=>event.status==="active");
 if(run.status==="idle"||!total)return null;
 return <section className={`longAnalysisProgress ${run.status}`} aria-label="Deep analysis progress">
  <button type="button" className="longAnalysisSummary" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>
   <span className="activityDotGrid" aria-hidden="true">{Array.from({length:9},(_,index)=><i key={index}/>)}</span>
   <span role="status" aria-live="polite"><b>{run.status==="running"?(current?.message||"Preparing analysis"):run.status==="error"?"Analysis interrupted":"Analysis finished"}</b><small>{completed} of {total} stages</small></span>
   <ChevronDown aria-hidden="true"/>
  </button>
  {expanded?<ol className="longAnalysisSteps">{run.events.map((event,index)=><li className={event.status} key={event.id}><span aria-hidden="true">{event.status==="complete"?"✓":event.status==="active"?"◌":index+1}</span><span>{event.message}</span></li>)}</ol>:null}
  {run.status==="error"&&run.errorMessage?<p className="longAnalysisError" role="alert">{run.errorMessage}</p>:null}
 </section>
}
