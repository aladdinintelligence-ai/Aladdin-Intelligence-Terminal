"use client";
import Link from "next/link";
import {useCallback,useState} from "react";
import {Bell,BrainCircuit,Ellipsis,Flame,Radio} from "lucide-react";
import {MobileMoreDrawer,moreRoutes} from "./MobileMoreDrawer";

const items=[["/launches","Launches",Radio],["/narratives","Narratives",Flame],["/ask-aladdin","Ask Aladdin",BrainCircuit],["/alerts","Alerts",Bell]] as const;
export function MobileDock({path}:{path:string}){const [moreOpen,setMoreOpen]=useState(false);const close=useCallback(()=>setMoreOpen(false),[]);const moreActive=moreRoutes.some(route=>path===route||path.startsWith(`${route}/`));return <><nav className="mobileDock" aria-label="Primary mobile navigation">{items.map(([href,label,Icon])=>{const active=path===href||path.startsWith(`${href}/`);return <Link className={active?"active":""} href={href} key={href}><Icon/><span>{label}</span></Link>})}<button type="button" className={moreOpen||moreActive?"active":""} aria-expanded={moreOpen} aria-label="More navigation" onClick={()=>setMoreOpen(open=>!open)}><Ellipsis/><span>More</span></button></nav><MobileMoreDrawer open={moreOpen} path={path} onClose={close}/></>}