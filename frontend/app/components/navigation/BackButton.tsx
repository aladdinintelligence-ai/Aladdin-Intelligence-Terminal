"use client";
import {ArrowLeft} from "lucide-react";
import {useRouter} from "next/navigation";

export function BackButton({fallback="/ask-aladdin",label="Back"}:{fallback?:string;label?:string}){
 const router=useRouter();
 return <button type="button" className="backButton" aria-label={label} onClick={()=>{if(window.history.length>1)router.back();else router.push(fallback)}}><ArrowLeft aria-hidden="true"/></button>;
}
