"use client";
import type {InvestigationRunState} from "@/app/types/analytics/query";
const PREFIX="aladdin-analysis-run:";
export function saveAnalysisRun(sessionId:string,run:InvestigationRunState){try{localStorage.setItem(`${PREFIX}${sessionId}`,JSON.stringify(run))}catch{}}
export function loadAnalysisRun(sessionId:string):InvestigationRunState|null{try{const raw=localStorage.getItem(`${PREFIX}${sessionId}`);if(!raw)return null;const run=JSON.parse(raw) as InvestigationRunState;if(!Array.isArray(run.events))return null;if(run.status==="running")return{...run,status:"error",completedAt:new Date().toISOString(),errorMessage:"This analysis was interrupted before it finished. The completed stages are preserved; submit the question again to retry."};return run}catch{return null}}
export function clearAnalysisRun(sessionId:string){try{localStorage.removeItem(`${PREFIX}${sessionId}`)}catch{}}
