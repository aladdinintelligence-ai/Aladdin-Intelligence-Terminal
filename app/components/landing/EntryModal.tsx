"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {MessageCircle,Wallet,X} from "lucide-react";
import {useRouter} from "next/navigation";
import {useAladdinWallet} from "@/app/hooks/useAladdinWallet";
import {useAuth} from "@/app/hooks/useAuth";
import {loadGoogleScript,initGoogleAuth,googleLogin} from "@/app/lib/auth/google";
import {telegramLogin} from "@/app/lib/auth/telegram";

const TELEGRAM_BOT_ID=process.env.NEXT_PUBLIC_TELEGRAM_BOT_ID||"";

export function EntryModal({open,onClose,onAuth}:{open:boolean;onClose:()=>void;onAuth?:()=>void}){
  const router=useRouter(),wallet=useAladdinWallet(),auth=useAuth(),closeRef=useRef<HTMLButtonElement>(null);
  const [error,setError]=useState<string|null>(null),[loading,setLoading]=useState<"google"|"telegram"|null>(null);

  useEffect(()=>{if(!open)return;closeRef.current?.focus();const key=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose()};addEventListener("keydown",key);return()=>removeEventListener("keydown",key)},[onClose,open]);

  const handleGoogleAuth=useCallback(async(idToken:string)=>{
    try{setLoading("google");setError(null);const response=await googleLogin(idToken);auth.setAuth(response.user);if(onAuth){onAuth()}else{router.push("/launches")}}catch(err){setError(err instanceof Error?err.message:"Google sign-in failed");setLoading(null)}
  },[auth,router,onAuth]);

  const handleTelegramAuth=useCallback(async(data:{id:number;first_name:string;last_name?:string;username?:string;photo_url?:string;auth_date:number;hash:string})=>{
    try{setLoading("telegram");setError(null);const response=await telegramLogin(data);auth.setAuth(response.user);if(onAuth){onAuth()}else{router.push("/launches")}}catch(err){setError(err instanceof Error?err.message:"Telegram sign-in failed");setLoading(null)}
  },[auth,router,onAuth]);

  const openTelegramAuth=useCallback(()=>{
    if(!TELEGRAM_BOT_ID){setError("Telegram is not configured");return}
    const width=600,height=700,left=window.screenX+(window.outerWidth-width)/2,top=window.screenY+(window.outerHeight-height)/2;
    const origin=window.location.origin;
    const url=`https://oauth.telegram.org/auth?bot_id=${TELEGRAM_BOT_ID}&origin=${encodeURIComponent(origin)}&return_to=${encodeURIComponent(origin)}`;
    const popup=window.open(url,"telegram_oauth",`width=${width},height=${height},left=${left},top=${top},scrollbars=yes`);
    const listener=(event:MessageEvent)=>{
      if(event.origin!=="https://oauth.telegram.org")return;
      if(event.source!==popup)return;
      window.removeEventListener("message",listener);
      if(event.data&&event.data.id&&event.data.hash){handleTelegramAuth(event.data)}
      else{setLoading(null)}
    };
    window.addEventListener("message",listener);
  },[handleTelegramAuth]);

  const openGoogleAuth=useCallback(()=>{
    loadGoogleScript().then(()=>{initGoogleAuth(handleGoogleAuth)}).catch(()=>{});
  },[handleGoogleAuth]);

  if(!open)return null;
  return <div className="entryBackdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><section className="entryModal" role="dialog" aria-modal="true" aria-labelledby="entry-title"><header><div><small>ALADDIN INTELLIGENCE</small><h2 id="entry-title">Continue to Aladdin</h2></div><button ref={closeRef} type="button" aria-label="Close entry options" onClick={onClose}><X/></button></header>{error?<p style={{color:"var(--error,#e5484d)",padding:"0 16px",fontSize:13}}>{error}</p>:null}<button type="button" style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:8,border:"1px solid var(--border,#2a2a2e)",background:"transparent",color:"var(--text-primary,#ededef)",fontSize:15,cursor:loading==="google"?"wait":"pointer",opacity:loading==="google"?0.7:1}} onClick={()=>{setLoading("google");openGoogleAuth()}} disabled={loading==="google"}><svg width="20" height="20" viewBox="0 0 24 24" style={{flexShrink:0}}><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg><span style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2}}><span>Continue with Google</span><small style={{fontSize:12,opacity:0.5}}>Sign in with your Google account</small></span></button><button type="button" style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:8,border:"1px solid var(--border,#2a2a2e)",background:"transparent",color:"var(--text-primary,#ededef)",fontSize:15,cursor:loading==="telegram"?"wait":"pointer",opacity:loading==="telegram"?0.7:1}} onClick={()=>{setLoading("telegram");openTelegramAuth()}} disabled={loading==="telegram"}><MessageCircle size={20} style={{color:"#0088cc",flexShrink:0}}/><span style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2}}><span>Continue with Telegram</span><small style={{fontSize:12,opacity:0.5}}>Sign in with your Telegram account</small></span></button><div className="entryDivider"><span>or</span></div><button type="button" className="walletEntry" onClick={()=>{onClose();wallet.openWalletModal({entryAsWallet:true,afterConnectPath:"/launches"})}}><Wallet/><span>Connect Solana Wallet<small>Real Wallet Standard connection · Mainnet</small></span></button><p>Account authentication and trading-wallet connection are separate. A wallet is optional until trading is requested.</p></section></div>}
