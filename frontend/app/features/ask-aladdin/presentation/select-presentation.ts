import type {AnalysisRequest} from "@/app/types/analytics/query";
import {buildContextualTokenEvidence,buildEarlyHolderKpi,buildTokenConsultation,tokenByContext,tokenByExactMint} from "@/app/data/synthetic/ask-aladdin/token-consultations";

export function selectAdaptivePresentation(request:AnalysisRequest){
 const exact=tokenByExactMint(request.question);if(exact)return buildTokenConsultation(exact);
 const token=tokenByContext(request.currentEntityId)||(/\bBARK\b/i.test(request.question)?tokenByContext("bark"):undefined);if(!token)return null;
 if(/how many.*(holders?|bought|buyers?).*(5\s*(min|minute))|first\s*5\s*(min|minute)/i.test(request.question))return buildEarlyHolderKpi(token);
 if(/when did (they|wallets?|holders?).*enter|entry timeline/i.test(request.question))return buildContextualTokenEvidence(token,"timeline");
 if(/are (they|wallets?|holders?).*sell|distribut|reducing/i.test(request.question))return buildContextualTokenEvidence(token,"flow");
 if(/how concentrated|concentration|top\s*10/i.test(request.question))return buildContextualTokenEvidence(token,"concentration");
 return null;
}