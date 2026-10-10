import type {AnswerMode} from "@/app/types/ask-aladdin";
import type {QueryPlan,ResultDataset} from "@/app/types/analytics/query";

export function interpretDataset(mode:AnswerMode,plan:QueryPlan,dataset:ResultDataset){
 if(!dataset.totalRows)return "No eligible synthetic rows are available for this filter. Widen the query to inspect the available fixture.";
 if(mode==="Trader")return plan.kind==="wallets"?"Specialist retention remains high, but every listed wallet has already reduced part of its entry. Monitor remaining supply and the pace of further selling.":"Retention and liquidity separate the stronger rows from weaker migrations; concentration remains the main material risk.";
 if(mode==="Analyst")return plan.kind==="wallets"?"Five of six classified specialists remain in the cohort. The table is ranked by remaining BARK quantity; classification coverage is limited to the available records.":"Lifecycle retention and liquidity deterioration explain most of the difference in this cohort; the sample is descriptive, not causal.";
 return plan.kind==="wallets"?"Specialist participation is still visible, while partial reductions should be communicated factually rather than framed as unanimous conviction.":"Sustained participation and liquidity are the strongest factual communication points; concentration and exits require transparent context.";
}
