import type {AskIntent,AnalysisRequest} from "@/app/types/analytics/query";
import {tokenByExactMint} from "@/app/data/synthetic/ask-aladdin/token-consultations";

export interface IntentResolution{intent:AskIntent;reply?:string}

const greeting=/^(hi|hello|hey|yo|good\s*(morning|day|afternoon|evening)|greetings)[!.?\s]*$/i;
const casual=/^(how are you|how's it going|thanks|thank you|cheers|what can you do|who are you|help)[!.?\s]*$/i;
const definition=/^(what|who)\s+(is|are|does)\b/i;
const dataTerms=/\b(show|which|compare|top|best|get|find|list|holders?|wallets?|tokens?|bought|sold|buy|holding|market|liquidity|volume|migration|today|yesterday|week|alert|insider|creator|first\s*100|BARK|FROG|retention|profit|specialist|trending|movers|analyse|analyze)\b/i;

export function resolveAskIntent(request:AnalysisRequest):IntentResolution{
 const question=request.question.trim();
 if(tokenByExactMint(question))return{intent:"data_query"};
 if(greeting.test(question))return{intent:"greeting",reply:"Hi Ola. What would you like to investigate?"};
 if(casual.test(question))return{intent:"casual",reply:"I’m ready. Ask me about a token, wallet or market change."};
 if(request.hasPriorContext&&/^(who|when|are|how|why|what changed|and|then|so)\b/i.test(question))return{intent:"follow_up"};
 if(definition.test(question)){
  if(/migration specialist/i.test(question))return{intent:"definition",reply:"A Migration Specialist is a wallet whose observed trading repeatedly focuses on tokens approaching or completing migration. The label describes behaviour in the available records; it does not identify the owner or guarantee future performance."};
  return{intent:"definition",reply:"Tell me the Aladdin term you want defined, and I’ll explain it in plain English."};
 }
 if(/^(buy|sell|hold|avoid)\b/i.test(question))return{intent:"unsupported",reply:"I can show the relevant market and wallet evidence, but I don’t issue trading verdicts. Which token or risk would you like to investigate?"};
 if(dataTerms.test(question)){if(/^(show|get|find|list|compare|analyse|analyze|rank|track|check)\b/i.test(question))return{intent:"data_query"};return{intent:request.hasPriorContext&&!/\b(BARK|FROG|token|wallet|market|today|yesterday)\b/i.test(question)?"follow_up":"data_query"}}
 if(question.split(/\s+/).length<4)return{intent:"ambiguous",reply:"What token, wallet or market activity would you like me to investigate?"};
 return{intent:"ambiguous",reply:"Could you name the token, wallet, period or market change you want to investigate?"};
}
