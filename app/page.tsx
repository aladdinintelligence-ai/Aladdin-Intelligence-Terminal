"use client";
import Image from "next/image";
import Link from "next/link";
import {useCallback,useState} from "react";
import {ArrowRight,BookOpen} from "lucide-react";
import {useRouter} from "next/navigation";
import {EntryModal} from "@/app/components/landing/EntryModal";
import {useAladdinWallet} from "@/app/hooks/useAladdinWallet";
import {useAuth} from "@/app/hooks/useAuth";

export default function Home(){
  const [entryOpen,setEntryOpen]=useState(false),router=useRouter(),wallet=useAladdinWallet();
  const {user,loading}=useAuth();
  // An existing session should go straight into the product instead of being
  // asked to sign in again. Gate on `loading` so a click that lands before
  // /api/auth/me resolves cannot flash the sign-in modal at a signed-in user.
  const launch=useCallback(()=>{
    if(loading)return;
    if(user){router.push("/launches");return}
    setEntryOpen(true);
  },[user,loading,router]);
  const closeEntry=useCallback(()=>setEntryOpen(false),[]);
  const exploreDemo=()=>{wallet.beginAccount("demo");router.push("/launches")};
  return <div className="publicLanding">
    <header className="landingNav"><Link href="/" className="landingBrand"><Image src="/aladdin-logo.jpg" width={38} height={38} alt="Aladdin" priority/><span>ALADDIN<small>INTELLIGENCE</small></span></Link><nav><Link href="#product">Product</Link><Link href="/settings?section=developer">API</Link></nav><button className="enterProduct" type="button" onClick={launch} disabled={loading}>Launch Aladdin <ArrowRight/></button></header>
    <main className="publicHero" id="product"><div className="heroCopy"><span className="eyebrow">SOLANA TRADING INTELLIGENCE</span><h1>Behaviour beneath<br/>the market.</h1><p>Aladdin resolves tokens, wallets and transactions into decision-ready evidence—then gives traders, analysts and token creators a structured Terminal and adaptive Ask Aladdin reasoning layer.</p><div className="landingActions"><button className="launchAladdin" type="button" onClick={launch} disabled={loading}>Launch Aladdin <ArrowRight/></button><button className="exploreDemo" type="button" onClick={exploreDemo}>Explore Demo</button></div><small className="mockNote">Google and Telegram account entry remain local simulations. Solana wallet connection uses Wallet Standard on Mainnet.</small></div><div className="heroVisual"><Image src="/aladdin-logo.jpg" width={430} height={430} alt="Aladdin Intelligence" priority/><div><span>SEARCH</span><i/><span>TERMINAL</span><i/><span>ASK ALADDIN</span></div></div></main>
    <footer className="landingFooter"><span>Behaviour-first. Evidence-first. Trader-first.</span><Link href="/settings?section=developer"><BookOpen/>Developer API</Link></footer><EntryModal open={entryOpen} onClose={closeEntry}/>
  </div>
}