import type {ActivityEvent,AnalysisRequest,AnalyticalRunResult} from "@/app/types/analytics/query";
import {askSseFetch} from "@/app/lib/api";

type ActivityListener=(events:ActivityEvent[])=>void;

async function runBackendAnalysis(request:AnalysisRequest,onActivity:ActivityListener,signal?:AbortSignal):Promise<AnalyticalRunResult>{
 const {frames,complete}=await askSseFetch("/api/ask",{
  question:request.question,mode:request.mode,period:request.period,
  depth:request.depth||"quick",hasPriorContext:request.hasPriorContext||false,
  currentEntityId:request.currentEntityId||null,
 },signal);
 for(const frame of frames){
  if(frame.type==="activity"&&frame.events)onActivity(frame.events);
 }
 if(!complete||!complete.result)throw new Error("Analysis did not complete");
 return complete.result;
}

export async function runAskAladdinAnalysis(request:AnalysisRequest,onActivity:ActivityListener=()=>{},signal?:AbortSignal):Promise<AnalyticalRunResult>{
 return runBackendAnalysis(request,onActivity,signal);
}

export type{ActivityListener};
