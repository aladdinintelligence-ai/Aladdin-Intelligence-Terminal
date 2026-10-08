import type {LaunchFilters,LaunchLifecycle,LaunchSortKey,LaunchToken} from "@/app/types/launches";

export const defaultLaunchFilters:LaunchFilters={search:"",marketCapMin:null,marketCapMax:null,liquidityMin:null,volumeMin:null,volumeChangeMin:null,ageMaxMinutes:null,lifecycle:[],bondingMin:null,migratedWithinMinutes:null,migrationSpecialistsMin:null,scalperShareMax:null,unknownShareMax:null,freshWalletsMin:null,sniperShareMax:null,bundlerShareMax:null,insider:"any",creatorSelling:"any"};

export const launchAcceptancePreset:LaunchFilters={...defaultLaunchFilters,marketCapMin:20000,marketCapMax:80000,volumeMin:20000,lifecycle:["new"],bondingMin:70,migrationSpecialistsMin:3,sniperShareMax:10};

export const moneyCompact=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:value<100000?1:2}).format(value);
export const countCompact=(value:number)=>new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(value);
export const ageLabel=(minutes:number):string=>{
  if (minutes===null||!Number.isFinite(minutes))return "—";
  if (minutes<1)return `${Math.max(1,Math.round(minutes*60))}s`;
  if (minutes<60)return `${Math.floor(minutes)}m`;
  if (minutes<1440)return `${Math.floor(minutes/60)}h`;
  return `${Math.floor(minutes/1440)}d`;
};

export function volumeChange(token:LaunchToken){
  if(token.ageMinutes<60||token.previousHourVolume===null||token.previousHourVolume===0)return null;
  return Math.round(((token.volume-token.previousHourVolume)/token.previousHourVolume)*100);
}

export function volumeWindow(token:LaunchToken){const a=token.ageMinutes;return a===null||!Number.isFinite(a)?"—":a<1?"<1m":a<60?`${Math.floor(a)}m`:"1H"}
export function participantTotal(token:LaunchToken){return Object.values(token.participants).reduce((sum,value)=>sum+value,0)}
export function participantShare(token:LaunchToken,key:"scalpers"|"unknown"){const total=participantTotal(token);return total?token.participants[key]/total*100:0}

export function filterLaunchTokens(tokens:LaunchToken[],filters:LaunchFilters){return tokens.filter(token=>{
  if(filters.search){const q=filters.search.toLowerCase();if(!token.symbol.toLowerCase().includes(q)&&!token.name.toLowerCase().includes(q))return false;}
  if(filters.lifecycle.length&&!filters.lifecycle.includes(token.lifecycle))return false;
  if(filters.marketCapMin!==null&&token.marketCap<filters.marketCapMin)return false;
  if(filters.marketCapMax!==null&&token.marketCap>filters.marketCapMax)return false;
  if(filters.liquidityMin!==null&&token.liquidity<filters.liquidityMin)return false;
  if(filters.volumeMin!==null&&token.volume<filters.volumeMin)return false;
  const change=volumeChange(token);
  if(filters.volumeChangeMin!==null&&(change===null||change<filters.volumeChangeMin))return false;
  if(filters.ageMaxMinutes!==null&&token.ageMinutes>filters.ageMaxMinutes)return false;
  if(filters.bondingMin!==null&&(token.bondingProgress===null||token.bondingProgress<filters.bondingMin))return false;
  if(filters.migratedWithinMinutes!==null&&(token.migratedMinutesAgo===null||token.migratedMinutesAgo>filters.migratedWithinMinutes))return false;
  if(filters.migrationSpecialistsMin!==null&&token.participants.migrationSpecialists<filters.migrationSpecialistsMin)return false;
  if(filters.scalperShareMax!==null&&participantShare(token,"scalpers")>filters.scalperShareMax)return false;
  if(filters.unknownShareMax!==null&&participantShare(token,"unknown")>filters.unknownShareMax)return false;
  if(filters.freshWalletsMin!==null&&token.participants.freshWallets<filters.freshWalletsMin)return false;
  if(filters.sniperShareMax!==null&&(token.walletContext.sniperShare===null||token.walletContext.sniperShare>filters.sniperShareMax))return false;
  if(filters.bundlerShareMax!==null&&(token.walletContext.bundlerShare===null||token.walletContext.bundlerShare>filters.bundlerShareMax))return false;
  if(filters.insider!=="any"&&token.walletContext.insiderPresent!==(filters.insider==="present"))return false;
  if(filters.creatorSelling!=="any"&&token.walletContext.creatorSelling!==(filters.creatorSelling==="true"))return false;
  return true;
})}

export function sortLaunchTokens(tokens:LaunchToken[],sort:LaunchSortKey){return [...tokens].sort((a,b)=>{
  if(sort==="newest")return a.ageMinutes-b.ageMinutes;
  if(sort==="market-cap")return b.marketCap-a.marketCap;
  if(sort==="liquidity")return b.liquidity-a.liquidity;
  if(sort==="volume")return b.volume-a.volume;
  if(sort==="volume-change")return (volumeChange(b)??-Infinity)-(volumeChange(a)??-Infinity);
  if(sort==="bonding")return (b.bondingProgress??-1)-(a.bondingProgress??-1);
  return b.participants.migrationSpecialists-a.participants.migrationSpecialists;
})}

export function lifecycleForTab(tab:string):LaunchLifecycle[]{
  if(tab==="New")return ["new"];
  if(tab==="Almost Bonded")return ["almost-bonded"];
  if(tab==="Migrated")return ["migrated"];
  return [];
}

export function activeFilterLabels(filters:LaunchFilters){
  const labels:{key:keyof LaunchFilters;label:string}[]=[];
  if(filters.search)labels.push({key:"search",label:`Search: ${filters.search}`});
  if(filters.marketCapMin!==null||filters.marketCapMax!==null)labels.push({key:"marketCapMin",label:`MC ${filters.marketCapMin!==null?moneyCompact(filters.marketCapMin):"any"}–${filters.marketCapMax!==null?moneyCompact(filters.marketCapMax):"any"}`});
  if(filters.liquidityMin!==null)labels.push({key:"liquidityMin",label:`LIQ >${moneyCompact(filters.liquidityMin)}`});
  if(filters.volumeMin!==null)labels.push({key:"volumeMin",label:`1H Vol >${moneyCompact(filters.volumeMin)}`});
  if(filters.volumeChangeMin!==null)labels.push({key:"volumeChangeMin",label:`1H Vol Δ >${filters.volumeChangeMin}%`});
  if(filters.ageMaxMinutes!==null)labels.push({key:"ageMaxMinutes",label:`Age <${ageLabel(filters.ageMaxMinutes)}`});
  if(filters.lifecycle.length)labels.push({key:"lifecycle",label:filters.lifecycle.map(x=>x==="almost-bonded"?"Almost Bonded":x[0].toUpperCase()+x.slice(1)).join(" · ")});
  if(filters.bondingMin!==null)labels.push({key:"bondingMin",label:`Bond >${filters.bondingMin}%`});
  if(filters.migratedWithinMinutes!==null)labels.push({key:"migratedWithinMinutes",label:`Migrated <${ageLabel(filters.migratedWithinMinutes)}`});
  if(filters.migrationSpecialistsMin!==null)labels.push({key:"migrationSpecialistsMin",label:`MS ≥${filters.migrationSpecialistsMin}`});
  if(filters.scalperShareMax!==null)labels.push({key:"scalperShareMax",label:`SC <${filters.scalperShareMax}%`});
  if(filters.unknownShareMax!==null)labels.push({key:"unknownShareMax",label:`UN <${filters.unknownShareMax}%`});
  if(filters.freshWalletsMin!==null)labels.push({key:"freshWalletsMin",label:`FW ≥${filters.freshWalletsMin}`});
  if(filters.sniperShareMax!==null)labels.push({key:"sniperShareMax",label:`Sniper <${filters.sniperShareMax}%`});
  if(filters.bundlerShareMax!==null)labels.push({key:"bundlerShareMax",label:`Bundler <${filters.bundlerShareMax}%`});
  if(filters.insider!=="any")labels.push({key:"insider",label:`Insider ${filters.insider}`});
  if(filters.creatorSelling!=="any")labels.push({key:"creatorSelling",label:`Creator selling ${filters.creatorSelling}`});
  return labels;
}

export function clearLaunchFilter(filters:LaunchFilters,key:keyof LaunchFilters):LaunchFilters{
  if(key==="marketCapMin")return {...filters,marketCapMin:null,marketCapMax:null};
  if(key==="search")return {...filters,search:""};
  return {...filters,[key]:defaultLaunchFilters[key]};
}
