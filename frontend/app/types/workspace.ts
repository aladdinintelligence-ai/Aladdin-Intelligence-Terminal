import type {AnswerMode,AskAladdinAnswer,ResolvedAnalysisPeriod} from "@/app/types/ask-aladdin";
export type ThemePreference="dark"|"light"|"system";
export type InvestigationStatus="active"|"archived";
export interface ConversationTurn{id:string;question:string;answer:AskAladdinAnswer;createdAt:string;analysisPeriod:ResolvedAnalysisPeriod}
export interface InvestigationSession{id:string;title:string;primaryProfile:AnswerMode;answerMode:AnswerMode;entityId:string;entityLabel:string;entityType:"token"|"wallet"|"transaction"|"cohort"|"none";analysisPeriod:ResolvedAnalysisPeriod|null;questions:string[];turns:ConversationTurn[];generatedNextQuestions:string[];savedQueryIds:string[];dashboardIds:string[];exportIds:string[];pinned:boolean;status:InvestigationStatus;createdAt:string;updatedAt:string}
export interface StructuredRow{token:string;symbol:string;contractAddress:string;marketCap:number|null;liquidity:number|null;volume:number|null;holders:number|null;retention:number|null;profitableWallets:number|null;strength:string;risk:string}
export interface SavedQuery{id:string;title:string;definition:string;entityType:string;filters:string[];columns:(keyof StructuredRow)[];sort:{column:keyof StructuredRow;direction:"asc"|"desc"};analysisPeriod:ResolvedAnalysisPeriod|null;resultCount:number;createdAt:string;lastRunAt:string;sourceInvestigationId:string;rows:StructuredRow[]}
export interface DashboardPanel{id:string;type:"kpi"|"table"|"chart";title:string;queryId:string;enabled:boolean}
export interface Dashboard{id:string;name:string;queryIds:string[];panels:DashboardPanel[];timeRange:string;filters:string[];refreshLabel:string;visibility:"private"|"shareable-placeholder";createdAt:string}
export interface ExportRecord{id:string;sourceType:"investigation"|"query"|"dashboard";sourceId:string;format:"CSV"|"JSON";rows:number;columns:number;estimatedBytes:number;exportType:string;creditCostPlaceholder:number;entitlementPlaceholder:string;createdAt:string;fileName:string}
