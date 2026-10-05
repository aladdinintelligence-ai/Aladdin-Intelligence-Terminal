import type {ActivityEvent,AnalysisRequest,AnalyticalRunResult,QueryOperation,ResultDataset} from "@/app/types/analytics/query";
import type {AskAladdinAnswer} from "@/app/types/ask-aladdin";
import {resolveAskIntent} from "./routing/intent-router";
import {planAskAladdinQuery} from "./planning/query-planner";
import {executeSyntheticQuery} from "./execution/synthetic-executor";
import {interpretDataset} from "./interpretation/profile-interpreter";
import {formatAnalyticalAnswer} from "./formatting/answer-formatter";
import {generateFollowUps} from "./follow-ups/generate-follow-ups";
import {askSseFetch} from "@/app/lib/api";

type ActivityListener=(events:ActivityEvent[])=>void;
const pause=(duration=420)=>new Promise(resolve=>setTimeout(resolve,duration));
const deepStages:Array<{operation:QueryOperation;message:string}>=[
 {operation:"resolving",message:"Resolving the question, entity and analysis period"},
 {operation:"filtering",message:"Loading and filtering matching records"},
 {operation:"calculating",message:"Calculating the requested features"},
 {operation:"ranking",message:"Analysing and ranking the results"},
 {operation:"formatting",message:"Creating the profile-specific interpretation"},
 {operation:"formatting",message:"Preparing the final result"},
];
function conversationalAnswer(request:AnalysisRequest,intent:ReturnType<typeof resolveAskIntent>):AskAladdinAnswer{return{mode:request.mode,intent:intent.intent,has_data:false,direct_answer:intent.reply||"What would you like to investigate?",query_definition:request.question,result_columns:[],result_rows:[],result_count:0,displayed_count:0,sort_definition:"",active_filters:[],analysis_period:request.period,currency_display:null,profile_summary:"",generated_follow_ups:[],full_query_link:"/queries",export_options:[],data_details:{evidenceSnapshotId:"",evidenceHash:"",coverage:"",limitations:[]},availability:"unavailable",synthetic:true,evidenceSnapshotId:"",evidenceHash:""}}

async function runLocalAnalysis(request:AnalysisRequest,onActivity:ActivityListener):Promise<AnalyticalRunResult>{
 const resolved=resolveAskIntent(request),isData=["data_query","follow_up"].includes(resolved.intent),deep=request.depth==="deep"&&isData,events:ActivityEvent[]=deep?deepStages.map((stage,index)=>({id:`${stage.operation}-${index}`,message:stage.message,operation:stage.operation,status:"pending",timestamp:new Date().toISOString()})):[];
 if(deep)onActivity([...events]);
 let step=0;
 async function operate(operation:QueryOperation,message:string,work:()=>void,duration=420){let event:ActivityEvent;if(deep){event=events[step];event.operation=operation;event.message=message;event.status="active";event.timestamp=new Date().toISOString()}else{event={id:`${operation}-${events.length}`,message,operation,status:"active",timestamp:new Date().toISOString()};events.push(event)}onActivity([...events]);await pause(duration);work();event.status="complete";step+=1;onActivity([...events])}
 if(!isData){await operate("resolving","Thinking",()=>{},650);const answer=conversationalAnswer(request,resolved),dataset:ResultDataset={columns:[],rows:[],totalRows:0,displayedRows:0,availability:"unavailable"};return{answer,queryPlan:null,dataset,activityEvents:events}}
 let plan!:ReturnType<typeof planAskAladdinQuery>,dataset!:ReturnType<typeof executeSyntheticQuery>,profileSummary="",answer!:ReturnType<typeof formatAnalyticalAnswer>;
 await operate("resolving","Resolving the question, entity and analysis period",()=>{plan=planAskAladdinQuery(request)});
 await operate("filtering","Loading and filtering matching records",()=>{dataset=executeSyntheticQuery(plan)});
 await operate("calculating","Calculating the requested features",()=>{dataset={...dataset,rows:dataset.rows.map(row=>({...row,values:{...row.values}}))}});
 await operate("ranking",plan.kind==="wallets"?"Analysing and ranking wallet behaviour":"Analysing and ranking matching market records",()=>{dataset={...dataset,rows:[...dataset.rows]}});
 await operate("formatting","Creating the profile-specific interpretation",()=>{profileSummary=interpretDataset(request.mode,plan,dataset)});
 await operate("formatting","Preparing the final result",()=>{answer=formatAnalyticalAnswer(request.question,request.mode,plan,dataset,profileSummary,generateFollowUps(request.question,plan.entityId||request.currentEntityId),request.currentEntityId)});
 answer.intent=resolved.intent;answer.has_data=true;return{answer,queryPlan:plan,dataset,activityEvents:events};
}

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
 try{
  return await runBackendAnalysis(request,onActivity,signal);
 }catch(error){
  const message=error instanceof Error?error.message:String(error);
  const networkIssue=/Failed to fetch|load failed|NetworkError|The Internet connection|ERR_|signal/i.test(message);
  if(networkIssue||/401|403/.test(message)){
   throw error;
  }
  throw error;
 }
}

export type{ActivityListener};