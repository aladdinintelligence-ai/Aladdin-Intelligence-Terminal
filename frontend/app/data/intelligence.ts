import {Observation,Trade} from "@/app/types";
export const observations:Observation[]=[
{title:"Profitable wallets entered",detail:"6 historically profitable wallets entered between buyers #62–87. Four remain fully positioned.",metric:"+6 wallets",tone:"good",action:"Inspect wallets"},
{title:"Early retention increasing",detail:"83 of the first 100 buyers remain. Historical median for similar launches is 61%.",metric:"83% retained",tone:"good",action:"Open First 100"},
{title:"Concentration increasing",detail:"Top-10 supply moved from 21.8% to 29.4% in nine minutes.",metric:"+7.6 pts",tone:"warn",action:"Inspect holders"},
{title:"Creator-linked distribution",detail:"Creator-linked cohort reduced holdings by 3.2% of supply in the previous 15 minutes.",metric:"−3.2% supply",tone:"bad",action:"Inspect activity"}
];
export const trades:Trade[]=[
{id:"tx1",tokenId:"bark",walletId:"7xK32a",time:"23:40:18",side:"BUY",amount:1.82,position:"$331",supply:"0.91%",remaining:84},
{id:"tx2",tokenId:"bark",walletId:"4Km91",time:"23:39:52",side:"BUY",amount:3.2,position:"$582",supply:"1.44%",remaining:100},
{id:"tx3",tokenId:"bark",walletId:"Cr8tor",time:"23:38:04",side:"SELL",amount:5.4,position:"$983",supply:"2.10%",remaining:41},
{id:"tx4",tokenId:"bark",walletId:"9Qa18",time:"23:36:41",side:"BUY",amount:0.9,position:"$164",supply:"0.48%",remaining:62}
];
export const chartPoints=[22,24,23,28,31,29,34,42,39,46,51,48,57,61,59,68,74,72,82];
