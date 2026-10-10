"use client";
import Link from "next/link";
import {useState} from "react";
import type {AskAladdinAnswer,LegacyAskAladdinAnswer,ResolvedAnalysisPeriod} from "@/app/types/ask-aladdin";
import {QueryResultTable} from "./QueryResultTable";
import {IntelligenceAnswer} from "./IntelligenceAnswer";

export function StructuredAnswer({answer,question,onExport}:{answer:AskAladdinAnswer|LegacyAskAladdinAnswer;question:string;period:ResolvedAnalysisPeriod;onExport:()=>void}){
  const [currency,setCurrency]=useState<"SOL"|"USD">("currency_display" in answer?answer.currency_display||"SOL":"SOL");
  if(!("result_rows" in answer))return <div className="conversationReply"><p>{"direct_answer" in answer&&typeof answer.direct_answer==="string"?answer.direct_answer:question}</p></div>;
  const structured=answer;
  if(structured.has_data===false){const actions=structured.page_actions??[];return <div className="conversationReply">{structured.direct_answer?<p>{structured.direct_answer}</p>:null}{actions.length?<div className="answerPageActions" aria-label="Suggested Aladdin pages">{actions.map(action=><Link key={action.route} href={action.route}>{action.label}</Link>)}</div>:null}</div>;}
  if(structured.presentation)return <IntelligenceAnswer presentation={structured.presentation} profileSummary={structured.profile_summary}/>;
  if(structured.availability!=="available")return <div className="structuredQueryAnswer noAnswer"><h2>{structured.direct_answer}</h2>{structured.profile_summary&&structured.profile_summary!==structured.direct_answer?<p className="profileSummary">{structured.profile_summary}</p>:null}</div>;
  return <div className="structuredQueryAnswer"><h2>{structured.direct_answer}</h2><QueryResultTable rows={structured.result_rows.slice(0,structured.displayed_count)} columns={structured.result_columns} currency={structured.currency_display?currency:null} onCurrencyChange={setCurrency}/><p className="profileSummary">{structured.profile_summary}</p><div className="resultActions"><Link href={`${structured.full_query_link}?definition=${encodeURIComponent(structured.query_definition)}`}>View all results</Link>{structured.export_options.length>0&&<button type="button" onClick={onExport}>Export full result</button>}{structured.result_rows[0]?.tokenId&&<Link href={`/live/${structured.result_rows[0].tokenId}?view=${encodeURIComponent(structured.result_rows[0].terminalView||"Live State")}`}>View all in Terminal</Link>}</div><details className="dataDetails"><summary>Data details</summary>{structured.synthetic&&structured.result_rows.length?<p>Source: Simulated data</p>:null}<p>Coverage: {structured.data_details.coverage}</p>{structured.data_details.limitations.map(item=><p key={item}>{item}</p>)}</details></div>;
}
