import type {AnalysisRunDepth} from "@/app/types/analytics/query";

const deepAnalysisTerms=/\b(compare|comparison|historical|cohort|formation|across|all wallets|first\s*100|connected wallets|cluster|profitable wallets|migration specialists|retention|concentration|since i entered|what changed while|export)\b/i;

export function classifyAnalysisRunDepth(question:string):AnalysisRunDepth{
 return deepAnalysisTerms.test(question)?"deep":"quick";
}
