"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {Filter,Search,SlidersHorizontal,X} from "lucide-react";
import type {LaunchFilters as LaunchFilterState,LaunchSortKey,LaunchToken} from "@/app/types/launches";
import {clearLaunchFilter,defaultLaunchFilters,filterLaunchTokens,sortLaunchTokens} from "@/app/utils/launches";
import {LaunchActiveFilters} from "@/app/components/launches/LaunchActiveFilters";
import {LaunchFilters} from "@/app/components/launches/LaunchFilters";
import {LaunchTokenCard} from "@/app/components/launches/LaunchTokenCard";
import {LaunchFeedRow} from "@/app/components/launches/LaunchFeedRow";
import {useAladdinWallet} from "@/app/hooks/useAladdinWallet";
import {useLaunches} from "@/app/hooks/useLaunches";
import {DevnetBuyModal} from "@/app/components/devnet-market/DevnetBuyModal";

const STORAGE_KEY="aladdin-launches-view-v2";
const tabs=["New","Almost Bonded","Migrated","Trending"] as const;
type Tab=(typeof tabs)[number];
interface StoredLaunchView{tab:Tab;filters:LaunchFilterState;sort:LaunchSortKey;scrollY:number}

export function LaunchesExperience(){
  const wallet=useAladdinWallet();
  const [tab,setTab]=useState<Tab>("New");
  const [filters,setFilters]=useState<LaunchFilterState>(defaultLaunchFilters);
  const [sort,setSort]=useState<LaunchSortKey>("newest");
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [selectedBuy,setSelectedBuy]=useState<LaunchToken|null>(null);
  const [hydrated,setHydrated]=useState(false);

  const {tokens:liveTokens,loading,refreshing,error}=useLaunches(tab);

  useEffect(()=>{try{const stored=JSON.parse(sessionStorage.getItem(STORAGE_KEY)??"null") as Partial<StoredLaunchView>|null;if(stored?.tab&&tabs.includes(stored.tab))setTab(stored.tab);if(stored?.filters)setFilters({...defaultLaunchFilters,...stored.filters});if(stored?.sort)setSort(stored.sort);requestAnimationFrame(()=>window.scrollTo({top:stored?.scrollY??0}));}catch{}setHydrated(true)},[]);

  useEffect(()=>{if(!hydrated)return;const save=()=>sessionStorage.setItem(STORAGE_KEY,JSON.stringify({tab,filters,sort,scrollY:window.scrollY}));save();window.addEventListener("pagehide",save);return()=>window.removeEventListener("pagehide",save)},[filters,hydrated,sort,tab]);

  const visible=useMemo(()=>{
    return sortLaunchTokens(filterLaunchTokens(liveTokens,filters),sort);
  },[filters,sort,liveTokens]);

  const removeFilter=useCallback((key:keyof LaunchFilterState)=>setFilters(current=>clearLaunchFilter(current,key)),[]);

  const onBuy=(token:LaunchToken)=>{
    setSelectedBuy(token);
    if(!wallet.connected)wallet.openWalletModal({reason:"$"+token.symbol+" Buy · resume this token after connection"})
  };

  return <>
    <div className="pageTitle">
      <div>
        <span className="eyebrow">MARKET DISCOVERY</span>
        <h1>Launches</h1>
        <p>Find activity, then investigate the behaviour underneath it.</p>
      </div>
      <div className="titleStats">
        <span><b>{liveTokens.length}</b> tracked</span>
        <span><b>{liveTokens.filter(x=>x.lifecycle==="almost-bonded").length}</b> almost bonded</span>
        <span><b>{liveTokens.filter(x=>x.lifecycle==="migrated").length}</b> migrated</span>
      </div>
    </div>

    <div className="toolbar launchesToolbar">
      <div className="tabs">
        {tabs.map(item=><button onClick={()=>setTab(item)} className={tab===item?"active":""} key={item}>{item}</button>)}
      </div>
      <div className="launchSearch">
        <Search size={14}/>
        <input type="text" placeholder="Search tokens..." value={filters.search} onChange={e=>setFilters(f=>({...f,search:e.target.value}))}/>
        {filters.search&&<button type="button" onClick={()=>setFilters(f=>({...f,search:""}))} aria-label="Clear search"><X size={12}/></button>}
      </div>
      <label className="launchSort">
        <SlidersHorizontal size={14}/>
        <select aria-label="Sort launches" value={sort} onChange={event=>setSort(event.target.value as LaunchSortKey)}>
          <option value="newest">Newest</option>
          <option value="market-cap">Market Cap</option>
          <option value="liquidity">Liquidity</option>
          <option value="volume">1H Volume</option>
          <option value="volume-change">1H Volume Change</option>
          <option value="bonding">Bonding Progress</option>
          <option value="migration-specialists">Migration Specialists</option>
        </select>
      </label>
      <button type="button" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(true)}>
        <Filter size={14}/>Filters
      </button>
    </div>

    <LaunchActiveFilters filters={filters} onRemove={removeFilter} onClear={()=>setFilters(defaultLaunchFilters)}/>

    <div className="launchResultMeta">
      <span>{visible.length} {tab.toLowerCase()} token{visible.length===1?"":"s"}</span>
      <span>{refreshing ? "Refreshing..." : "Live on-chain data via Bitquery"}</span>
    </div>

    {loading ? (
      <div className="launchEmpty">
        <b>Loading launches...</b>
        <span>Fetching live data from Solana blockchain</span>
      </div>
    ) : error && !liveTokens.length ? (
      <div className="launchEmpty">
        <b>Error loading launches</b>
        <span>{error}</span>
      </div>
    ) : visible.length ? (
      <div className="launchCardGrid">
        {visible.map(token=><div className="launchResponsiveItem" key={token.id}><LaunchTokenCard token={token} onBuy={onBuy}/><LaunchFeedRow token={token} onBuy={onBuy}/></div>)}
      </div>
    ) : (
      <div className="launchEmpty">
        <b>No launches match these filters.</b>
        <span>Try widening the market or behaviour conditions.</span>
        <button onClick={()=>setFilters(defaultLaunchFilters)}>Clear filters</button>
      </div>
    )}

    <DevnetBuyModal token={selectedBuy} onClose={()=>setSelectedBuy(null)}/>
    <LaunchFilters open={filtersOpen} filters={filters} onApply={setFilters} onClose={()=>setFiltersOpen(false)}/>
  </>;
}
