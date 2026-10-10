"use client";
import Link from "next/link";
import {useMemo,useState} from "react";
import {Copy} from "lucide-react";
import {SOL_USD} from "@/app/data/synthetic/ask-aladdin/query-fixtures";
import type {AskResultRow,ResultColumn} from "@/app/types/ask-aladdin";

const tokenAmount=(value:unknown)=>typeof value==="number"?`${value.toLocaleString()} BARK`:"Unavailable";
function display(row:AskResultRow,column:ResultColumn,currency:"SOL"|"USD"){
 const value=row.values[column.key];if(value===null||value===undefined)return "Unavailable";
 if(column.kind==="money")return currency==="SOL"?`${Number(value).toFixed(2)} SOL`:`$${(Number(value)*SOL_USD).toLocaleString(undefined,{maximumFractionDigits:2})}`;
 if(column.kind==="usd")return `$${Number(value).toLocaleString()}`;
 if(column.kind==="percent")return `${value}%`;
 if(column.kind==="number")return Number(value).toLocaleString();
 if(column.kind==="token")return tokenAmount(value);
 return String(value);
}
export function QueryResultTable({rows,columns,currency,onCurrencyChange}:{rows:AskResultRow[];columns:ResultColumn[];currency:"SOL"|"USD"|null;onCurrencyChange?:(value:"SOL"|"USD")=>void}){
 const [sortKey,setSortKey]=useState(columns[0]?.key||""),[filter,setFilter]=useState("");
 const visible=useMemo(()=>rows.filter(row=>Object.values(row.values).join(" ").toLowerCase().includes(filter.toLowerCase())).toSorted((a,b)=>String(b.values[sortKey]??"").localeCompare(String(a.values[sortKey]??""),undefined,{numeric:true})),[rows,filter,sortKey]);
 return <div className="queryResult"><div className="queryTableTools"><input aria-label="Filter results" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter rows"/><select aria-label="Sort results" value={sortKey} onChange={e=>setSortKey(e.target.value)}>{columns.map(column=><option value={column.key} key={column.key}>Sort: {column.label}</option>)}</select>{currency&&<div className="currencySwitch" aria-label="Amount currency">{(["SOL","USD"] as const).map(value=><button type="button" className={currency===value?"active":""} onClick={()=>onCurrencyChange?.(value)} key={value}>{value}</button>)}</div>}</div><div className="queryTableScroll"><table><thead><tr>{columns.map(column=><th key={column.key}>{column.label}{column.kind==="money"&&currency?` · ${currency}`:""}</th>)}</tr></thead><tbody>{visible.map(row=><tr key={row.id}>{columns.map(column=><td key={column.key}>{column.kind==="wallet"&&row.walletId?<Link href={`/wallet/${row.walletId}?token=${row.tokenId||""}`}>{display(row,column,currency||"SOL")}</Link>:column.kind==="tokenLink"&&row.tokenId?<Link href={`/live/${row.tokenId}`}>{display(row,column,currency||"SOL")}</Link>:column.kind==="contract"?<span className="contractCell"><code>{String(row.values[column.key]).slice(0,6)}…{String(row.values[column.key]).slice(-4)}</code><button type="button" aria-label="Copy contract" onClick={()=>navigator.clipboard?.writeText(String(row.values[column.key]))}><Copy/></button></span>:<span className={column.kind==="side"?String(row.values[column.key]).toLowerCase():""}>{display(row,column,currency||"SOL")}</span>}</td>)}</tr>)}</tbody></table></div></div>;
}
