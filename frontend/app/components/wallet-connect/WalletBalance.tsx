"use client";
import {RefreshCw} from "lucide-react";
import {useAladdinWallet} from "@/app/hooks/useAladdinWallet";
import {formatSolBalance} from "@/app/utils/wallet";
export function WalletBalance({refresh=false}:{refresh?:boolean}){const wallet=useAladdinWallet();return <span className="walletBalance">{wallet.balanceStatus==="loading"?"Reading balance…":formatSolBalance(wallet.balance)}{refresh&&wallet.connected?<button type="button" aria-label="Refresh wallet balance" onClick={()=>void wallet.refreshBalance()}><RefreshCw/></button>:null}</span>}