import type {CSSProperties} from "react";
import type {LaunchLifecycle} from "@/app/types/launches";

type TokenMotif="mascot"|"planet"|"bot"|"leaf"|"frog"|"flame"|"wave"|"gem"|"ghost"|"bolt"|"star"|"orb";
const TOKEN_ART:Record<string,TokenMotif>={mochi:"mascot",orbit:"planet",pixel:"bot",sprout:"leaf",neon:"frog",crumb:"flame",squid:"wave",dust:"gem",bullz:"mascot","milo-launch":"orb",quack:"frog",zen:"star",toast:"flame",wisp:"ghost",capy:"mascot",jolt:"bolt",nova:"star","bark-launch":"mascot",glow:"orb",rune:"gem",mew:"mascot",beam:"bolt",tide:"wave",void:"planet"};

function tokenSeed(value:string){let seed=0;for(const character of value)seed=(seed*31+character.charCodeAt(0))>>>0;return seed}

export function SyntheticTokenImage({id,symbol,color,lifecycle,variant}:{id:string;symbol:string;color:string;lifecycle:LaunchLifecycle;variant:"card"|"feed"}){
  const seed=tokenSeed(id);const motif=TOKEN_ART[id]??"orb";const accent=`hsl(${seed%360} 78% 62%)`;const secondary=`hsl(${(seed+113)%360} 72% 52%)`;const gradientId=`token-${id}-${variant}`;const shineId=`shine-${id}-${variant}`;
  return <span className={`syntheticTokenImage syntheticTokenImage-${variant} tokenImage-${lifecycle}`} style={{"--token-color":color} as CSSProperties} role="img" aria-label={`${symbol} synthetic token artwork`}>
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs><linearGradient id={gradientId} x1="7" y1="4" x2="58" y2="61" gradientUnits="userSpaceOnUse"><stop stopColor={color}/><stop offset=".5" stopColor={accent}/><stop offset="1" stopColor={secondary}/></linearGradient><radialGradient id={shineId} cx="0" cy="0" r="1" gradientTransform={`translate(${17+seed%11} ${14+(seed>>3)%9}) rotate(48) scale(35)`}><stop stopColor="#fff" stopOpacity=".55"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></radialGradient></defs>
      <rect width="64" height="64" rx="12" fill={`url(#${gradientId})`}/><rect width="64" height="64" rx="12" fill={`url(#${shineId})`}/>
      <path d={`M0 ${47+seed%7}C16 ${37+(seed>>4)%8} 35 ${54-(seed>>6)%9} 64 ${35+(seed>>8)%9}V64H0Z`} fill="#070610" fillOpacity=".2"/>
      <Artwork motif={motif} seed={seed}/>
      <circle cx={51-(seed%5)} cy={11+(seed%4)} r="1.5" fill="#fff" fillOpacity=".72"/><circle cx={9+(seed%7)} cy={47-(seed%6)} r="1" fill="#fff" fillOpacity=".42"/>
    </svg>
  </span>
}

function Artwork({motif,seed}:{motif:TokenMotif;seed:number}){
  const tilt=(seed%9)-4;
  if(motif==="mascot")return <g transform={`rotate(${tilt} 32 33)`}><path d="M18 25 20 13l10 8h4l10-8 2 12a19 19 0 1 1-28 0Z" fill="#0a0811" fillOpacity=".82"/><path d="M22 33c4-5 16-5 20 0-2 10-18 10-20 0Z" fill="#fff" fillOpacity=".16"/><ellipse cx="26" cy="30" rx="3" ry="4" fill="#fff"/><ellipse cx="39" cy="30" rx="3" ry="4" fill="#fff"/><circle cx="27" cy="31" r="1.4" fill="#08070d"/><circle cx="38" cy="31" r="1.4" fill="#08070d"/></g>;
  if(motif==="planet")return <g transform={`rotate(${tilt-8} 32 32)`}><ellipse cx="32" cy="34" rx="25" ry="8" fill="none" stroke="#fff" strokeOpacity=".68" strokeWidth="4"/><circle cx="32" cy="31" r="15" fill="#0a0811" fillOpacity=".77"/><path d="M21 27c8 5 16 2 23-3" fill="none" stroke="#fff" strokeOpacity=".28" strokeWidth="3"/></g>;
  if(motif==="bot")return <g><path d="M19 20h26a5 5 0 0 1 5 5v23H14V25a5 5 0 0 1 5-5Z" fill="#090811" fillOpacity=".8"/><path d="M32 20V12m-4 0h8" stroke="#fff" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round"/><rect x="20" y="27" width="24" height="14" rx="6" fill="#fff" fillOpacity=".16"/><circle cx="27" cy="34" r="3" fill="#fff"/><circle cx="38" cy="34" r="3" fill="#fff"/></g>;
  if(motif==="leaf")return <g transform={`rotate(${tilt} 32 32)`}><path d="M50 13C27 14 15 25 17 48c22 3 33-12 33-35Z" fill="#0b0a11" fillOpacity=".75"/><path d="M20 46c9-10 16-17 27-27M30 35l-1-11m8 4 9 1" fill="none" stroke="#fff" strokeOpacity=".68" strokeWidth="2.5" strokeLinecap="round"/></g>;
  if(motif==="frog")return <g><circle cx="22" cy="23" r="9" fill="#090811" fillOpacity=".78"/><circle cx="43" cy="23" r="9" fill="#090811" fillOpacity=".78"/><path d="M14 31c0-9 36-9 36 0 0 15-8 22-18 22S14 46 14 31Z" fill="#090811" fillOpacity=".78"/><circle cx="23" cy="22" r="3" fill="#fff"/><circle cx="42" cy="22" r="3" fill="#fff"/><path d="M24 41c5 4 11 4 16 0" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round"/></g>;
  if(motif==="flame")return <path d="M33 8c6 10 3 15 10 21 5 5 7 10 4 17-4 10-18 13-26 5-9-10-1-20 7-26-1 7 2 10 5 11 7-8-4-16 0-28Z" fill="#090811" fillOpacity=".78" stroke="#fff" strokeOpacity=".28" strokeWidth="2"/>;
  if(motif==="wave")return <g fill="none" stroke="#090811" strokeOpacity=".76" strokeWidth="6" strokeLinecap="round"><path d="M10 24c8-9 14 9 23 0s15 9 22 0"/><path d="M10 39c8-9 14 9 23 0s15 9 22 0"/></g>;
  if(motif==="gem")return <g transform={`rotate(${tilt} 32 32)`}><path d="m32 8 21 18-9 27H20L11 26Z" fill="#090811" fillOpacity=".76"/><path d="m12 26 20 9 21-9M32 9v26L20 52m12-17 12 17" fill="none" stroke="#fff" strokeOpacity=".48" strokeWidth="2"/></g>;
  if(motif==="ghost")return <path d="M16 51V30c0-13 7-20 16-20s16 7 16 20v21l-8-5-8 5-8-5-8 5Zm9-23a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm14 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="#090811" fillOpacity=".78" fillRule="evenodd"/>;
  if(motif==="bolt")return <path d="M36 6 14 37h15l-3 22 24-34H35Z" fill="#090811" fillOpacity=".8" stroke="#fff" strokeOpacity=".32" strokeWidth="2" strokeLinejoin="round"/>;
  if(motif==="star")return <path d="m32 7 7 16 18 2-14 12 4 18-15-9-16 9 5-18L7 25l18-2Z" fill="#090811" fillOpacity=".78" stroke="#fff" strokeOpacity=".32" strokeWidth="2"/>;
  return <g><circle cx="32" cy="32" r="20" fill="#090811" fillOpacity=".75"/><circle cx="32" cy="32" r="11" fill="none" stroke="#fff" strokeOpacity=".62" strokeWidth="3"/><circle cx="32" cy="32" r="3" fill="#fff"/></g>;
}