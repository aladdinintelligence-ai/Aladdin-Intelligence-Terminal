"use client";
import {ShieldCheck} from "lucide-react";
export function NetworkNotice({open,reason,onContinue}:{open:boolean;reason:string;onContinue:()=>void}){
 if(!open)return null;
 return <div className="walletModalBackdrop"><section className="networkNotice" role="dialog" aria-modal="true" aria-labelledby="network-title"><ShieldCheck/><small>MAINNET</small><h2 id="network-title">Solana Mainnet connected</h2><p>You are connected to Solana Mainnet. Balances and any transaction you sign use real SOL with real value. Review every transaction before approving it in your wallet.</p>{reason?<span>Pending context: {reason}</span>:null}<div><i/>Network &mdash; Solana Mainnet</div><button type="button" onClick={onContinue}>Continue</button></section></div>
}
