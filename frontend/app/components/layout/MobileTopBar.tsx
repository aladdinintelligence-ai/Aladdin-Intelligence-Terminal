/* eslint-disable @next/next/no-img-element */
"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {Search} from "lucide-react";
import {AccountControl} from "@/app/components/account/AccountControl";
import {openSearch} from "@/app/components/search/searchBus";

function contextLabel(path:string){
  if(path.startsWith("/live/"))return `$${path.split("/")[2]?.toUpperCase()||"TOKEN"} Terminal`;
  if(path.startsWith("/narratives"))return "Narratives";
  if(path.startsWith("/ask-aladdin"))return "Ask Aladdin";
  if(path.startsWith("/alerts"))return "Alerts";
  return "Aladdin";
}
export function MobileTopBar(){const path=usePathname();return <div className="mobileTopBar"><Link href="/launches" className="mobileBrand"><img src="/aladdin-logo.jpg" alt="Aladdin"/><span>{contextLabel(path)}</span></Link><div className="mobileTopActions"><button type="button" aria-label="Search Aladdin" onClick={openSearch}><Search/></button><AccountControl/></div></div>}