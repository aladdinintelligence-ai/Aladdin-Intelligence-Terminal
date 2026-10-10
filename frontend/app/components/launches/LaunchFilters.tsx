"use client";
import {useEffect,useId,useRef,useState} from "react";
import {X} from "lucide-react";
import type {LaunchFilters as LaunchFilterState,LaunchLifecycle} from "@/app/types/launches";
import {launchAcceptancePreset} from "@/app/utils/launches";

export function LaunchFilters({open,filters,onApply,onClose}:{open:boolean;filters:LaunchFilterState;onApply:(filters:LaunchFilterState)=>void;onClose:()=>void}){
  const [draft,setDraft]=useState(filters);const titleId=useId();const panelRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(open)setDraft(filters)},[open,filters]);
  useEffect(()=>{if(!open)return;const previous=document.activeElement as HTMLElement|null;panelRef.current?.focus();const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose()};document.addEventListener("keydown",onKey);return()=>{document.removeEventListener("keydown",onKey);previous?.focus()}},[open,onClose]);
  if(!open)return null;
  const setNumber=(key:keyof LaunchFilterState,value:string)=>setDraft(current=>({...current,[key]:value===""?null:Number(value)}));
  const toggleLifecycle=(value:LaunchLifecycle)=>setDraft(current=>({...current,lifecycle:current.lifecycle.includes(value)?current.lifecycle.filter(x=>x!==value):[...current.lifecycle,value]}));
  return <><button className="launchFilterBackdrop" aria-label="Close filters" onClick={onClose}/><div className="launchFilterPanel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={panelRef}>
    <header><div><span>BEHAVIOURAL SCREENER</span><h2 id={titleId}>Launch filters</h2></div><button aria-label="Close filters" onClick={onClose}><X size={17}/></button></header>
    <div className="launchFilterBody">
      <FilterGroup title="Market"><NumberField label="Market cap min ($)" value={draft.marketCapMin} onChange={v=>setNumber("marketCapMin",v)}/><NumberField label="Market cap max ($)" value={draft.marketCapMax} onChange={v=>setNumber("marketCapMax",v)}/><NumberField label="Liquidity min ($)" value={draft.liquidityMin} onChange={v=>setNumber("liquidityMin",v)}/><NumberField label="Volume min ($)" value={draft.volumeMin} onChange={v=>setNumber("volumeMin",v)}/><NumberField label="1H volume change min (%)" value={draft.volumeChangeMin} onChange={v=>setNumber("volumeChangeMin",v)}/><NumberField label="Age max (minutes)" value={draft.ageMaxMinutes} onChange={v=>setNumber("ageMaxMinutes",v)}/></FilterGroup>
      <FilterGroup title="Lifecycle"><div className="launchCheckRow">{([['new','New'],['almost-bonded','Almost Bonded'],['migrated','Migrated']] as [LaunchLifecycle,string][]).map(([value,label])=><label key={value}><input type="checkbox" checked={draft.lifecycle.includes(value)} onChange={()=>toggleLifecycle(value)}/>{label}</label>)}</div><NumberField label="Bonding progress min (%)" value={draft.bondingMin} onChange={v=>setNumber("bondingMin",v)}/><NumberField label="Migrated within (minutes)" value={draft.migratedWithinMinutes} onChange={v=>setNumber("migratedWithinMinutes",v)}/></FilterGroup>
      <FilterGroup title="Behaviour"><NumberField label="Migration Specialists min" value={draft.migrationSpecialistsMin} onChange={v=>setNumber("migrationSpecialistsMin",v)}/><NumberField label="Scalper share max (%)" value={draft.scalperShareMax} onChange={v=>setNumber("scalperShareMax",v)}/><NumberField label="Unknown share max (%)" value={draft.unknownShareMax} onChange={v=>setNumber("unknownShareMax",v)}/><NumberField label="Fresh Wallets min" value={draft.freshWalletsMin} onChange={v=>setNumber("freshWalletsMin",v)}/></FilterGroup>
      <FilterGroup title="Token-specific wallet context"><NumberField label="Sniper share max (%)" value={draft.sniperShareMax} onChange={v=>setNumber("sniperShareMax",v)}/><NumberField label="Bundler share max (%)" value={draft.bundlerShareMax} onChange={v=>setNumber("bundlerShareMax",v)}/><SelectField label="Insider presence" value={draft.insider} onChange={value=>setDraft(current=>({...current,insider:value as LaunchFilterState['insider']}))} options={[['any','Any'],['none','None'],['present','Present']]}/><SelectField label="Creator selling" value={draft.creatorSelling} onChange={value=>setDraft(current=>({...current,creatorSelling:value as LaunchFilterState['creatorSelling']}))} options={[['any','Any'],['false','False'],['true','True']]}/></FilterGroup>
    </div>
    <footer><button onClick={()=>setDraft(launchAcceptancePreset)}>Use discovery preset</button><button className="applyLaunchFilters" onClick={()=>{onApply(draft);onClose()}}>Apply filters</button></footer>
  </div></>;
}

function FilterGroup({title,children}:{title:string;children:React.ReactNode}){return <fieldset><legend>{title}</legend><div className="launchFilterGrid">{children}</div></fieldset>}
function NumberField({label,value,onChange}:{label:string;value:number|null;onChange:(value:string)=>void}){return <label className="launchFilterField"><span>{label}</span><input type="number" min="0" value={value??""} onChange={event=>onChange(event.target.value)} placeholder="Any"/></label>}
function SelectField({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:[string,string][]}){return <label className="launchFilterField"><span>{label}</span><select value={value} onChange={event=>onChange(event.target.value)}>{options.map(([key,text])=><option value={key} key={key}>{text}</option>)}</select></label>}
