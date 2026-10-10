import type {AskResultRow,ResultColumn} from "@/app/types/ask-aladdin";
import {structuredRows} from "@/app/data/workspace";

export const SOL_USD=182.41;
export const walletColumns:ResultColumn[]=[
 {key:"wallet",label:"Wallet",kind:"wallet"},{key:"behaviour",label:"Behaviour",kind:"text"},
 {key:"amount",label:"Amount",kind:"money"},{key:"side",label:"Side",kind:"side"},
 {key:"supply",label:"Supply acquired",kind:"percent"},{key:"amountSold",label:"Amount sold",kind:"token"},
 {key:"stillHolding",label:"Still holding",kind:"token"}
];
export const barkMigrationSpecialists:AskResultRow[]=[
 {id:"bark-ms-1",entityType:"wallet",walletId:"7xK3Migration91Pd",tokenId:"bark",terminalView:"Participants",values:{behaviour:"Migration Specialist",amount:3.42,side:"Buy",supply:1.84,amountSold:128400,stillHolding:491600,wallet:"7xK3...91Pd"}},
 {id:"bark-ms-2",entityType:"wallet",walletId:"4Km8Specialist31xQ",tokenId:"bark",terminalView:"Participants",values:{behaviour:"Migration Specialist",amount:2.86,side:"Buy",supply:1.43,amountSold:91400,stillHolding:386900,wallet:"4Km8...31xQ"}},
 {id:"bark-ms-3",entityType:"wallet",walletId:"9Qa2Migration44Lm",tokenId:"bark",terminalView:"Participants",values:{behaviour:"Migration Specialist",amount:2.31,side:"Buy",supply:1.18,amountSold:78200,stillHolding:315800,wallet:"9Qa2...44Lm"}},
 {id:"bark-ms-4",entityType:"wallet",walletId:"6Jp7Specialist82Rn",tokenId:"bark",terminalView:"Participants",values:{behaviour:"Migration Specialist",amount:1.94,side:"Buy",supply:.96,amountSold:60400,stillHolding:258600,wallet:"6Jp7...82Rn"}},
 {id:"bark-ms-5",entityType:"wallet",walletId:"3Vs5Migration17Tk",tokenId:"bark",terminalView:"Participants",values:{behaviour:"Migration Specialist",amount:1.52,side:"Buy",supply:.78,amountSold:44700,stillHolding:217300,wallet:"3Vs5...17Tk"}}
];
export const tokenColumns:ResultColumn[]=[
 {key:"token",label:"Token",kind:"tokenLink"},{key:"contractAddress",label:"Contract",kind:"contract"},
 {key:"marketCap",label:"Market cap",kind:"usd"},{key:"liquidity",label:"Liquidity",kind:"usd"},
 {key:"volume",label:"Volume",kind:"usd"},{key:"holders",label:"Holders",kind:"number"},
 {key:"retention",label:"First-100",kind:"percent"},{key:"profitableWallets",label:"Profitable wallets",kind:"number"},
 {key:"strength",label:"Main strength",kind:"text"},{key:"risk",label:"Main risk",kind:"text"}
];
export const tokenResultRows:AskResultRow[]=structuredRows.map(row=>({id:`token-${row.symbol.toLowerCase()}`,entityType:"token",tokenId:row.symbol.toLowerCase(),terminalView:"Live State",values:{...row,token:`${row.token} · $${row.symbol}`}}));
export const comparisonColumns:ResultColumn[]=[{key:"metric",label:"Metric",kind:"text"},{key:"bark",label:"BARK",kind:"text"},{key:"frog",label:"FROG",kind:"text"},{key:"difference",label:"Difference",kind:"text"}];
export const barkFrogComparison:AskResultRow[]=[
 {id:"compare-retention",entityType:"cohort",tokenId:"bark",terminalView:"First 100",values:{metric:"First-100 retention",bark:"76%",frog:"29%",difference:"+47 pp"}},
 {id:"compare-liquidity",entityType:"cohort",tokenId:"bark",terminalView:"Live State",values:{metric:"Liquidity change from peak",bark:"−11%",frog:"−46%",difference:"+35 pp"}},
 {id:"compare-specialists",entityType:"cohort",tokenId:"bark",terminalView:"Participants",values:{metric:"Specialists holding",bark:"5 of 6",frog:"1 of 4",difference:"+4 wallets"}},
 {id:"compare-concentration",entityType:"cohort",tokenId:"bark",terminalView:"Largest Holders",values:{metric:"Top-10 supply",bark:"22.8%",frog:"48.3%",difference:"−25.5 pp"}}
];
