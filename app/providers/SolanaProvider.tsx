"use client";
import {useCallback,useEffect,useMemo,useState,type ReactNode} from "react";
import {useRouter} from "next/navigation";
import {ConnectionProvider,WalletProvider,useConnection,useWallet} from "@solana/wallet-adapter-react";
import {WalletReadyState,type WalletError,type WalletName} from "@solana/wallet-adapter-base";
import {clusterApiUrl,LAMPORTS_PER_SOL} from "@solana/web3.js";
import {AladdinWalletContext} from "@/app/hooks/useAladdinWallet";
import {useAuth} from "@/app/hooks/useAuth";
import {fetchNonce,phantomLogin} from "@/app/lib/auth/phantom";
import type {AladdinAccountMode,WalletModalOptions} from "@/app/types/wallet";
import {shortenWalletAddress,walletErrorMessage} from "@/app/utils/wallet";
import {WalletConnectModal} from "@/app/components/wallet-connect/WalletConnectModal";
import {NetworkNotice} from "@/app/components/wallet-connect/NetworkNotice";

const ACCOUNT_KEY="aladdin-account-mode-v1";
const NETWORK_NOTICE_KEY="aladdin-network-notice-seen-v1";
const endpoint=process.env.NEXT_PUBLIC_SOLANA_RPC_URL||clusterApiUrl("mainnet-beta");

export function SolanaProvider({children}:{children:ReactNode}){
  const onError=useCallback((error:WalletError)=>console.warn("Solana wallet connection error:",error.message),[]);
  return <ConnectionProvider endpoint={endpoint}><WalletProvider wallets={[]} autoConnect onError={onError}><WalletStateBridge>{children}</WalletStateBridge></WalletProvider></ConnectionProvider>
}
function WalletStateBridge({children}:{children:ReactNode}){
  const router=useRouter();const {connection}=useConnection();const {wallet,wallets,publicKey,connected,connecting,select,connect,disconnect}=useWallet();
  const auth=useAuth();
  const [balance,setBalance]=useState<number|null>(null),[balanceStatus,setBalanceStatus]=useState<"idle"|"loading"|"ready"|"unavailable">("idle");
  const [error,setError]=useState<string|null>(null),[modal,setModal]=useState<WalletModalOptions|null>(null),[pendingWallet,setPendingWallet]=useState<WalletName|null>(null);
  const [accountMode,setAccountMode]=useState<AladdinAccountMode>(null),[noticeOpen,setNoticeOpen]=useState(false),[afterConnectPath,setAfterConnectPath]=useState<string|null>(null);
  const [phantomAuthPending,setPhantomAuthPending]=useState(false);
  useEffect(()=>{const stored=localStorage.getItem(ACCOUNT_KEY);if(stored==="demo"||stored==="google"||stored==="telegram"||stored==="wallet")setAccountMode(stored)},[]);
  const beginAccount=useCallback((mode:Exclude<AladdinAccountMode,null>)=>{localStorage.setItem(ACCOUNT_KEY,mode);setAccountMode(mode)},[]);
  const refreshBalance=useCallback(async()=>{if(!publicKey){setBalance(null);setBalanceStatus("idle");return}setBalanceStatus("loading");try{setBalance((await connection.getBalance(publicKey,"confirmed"))/LAMPORTS_PER_SOL);setBalanceStatus("ready")}catch{setBalance(null);setBalanceStatus("unavailable")}},[connection,publicKey]);
  useEffect(()=>{void refreshBalance();if(!publicKey)return;const subscription=connection.onAccountChange(publicKey,info=>{setBalance(info.lamports/LAMPORTS_PER_SOL);setBalanceStatus("ready")},"confirmed");return()=>{void connection.removeAccountChangeListener(subscription)}},[connection,publicKey,refreshBalance]);
  useEffect(()=>{if(!pendingWallet||wallet?.adapter.name!==pendingWallet)return;let active=true;void connect().then(()=>{if(active)setError(null)}).catch(cause=>{if(active)setError(walletErrorMessage(cause))}).finally(()=>{if(active)setPendingWallet(null)});return()=>{active=false}},[connect,pendingWallet,wallet?.adapter.name]);
  useEffect(()=>{if(!connected||!publicKey||!modal)return;
    const performPhantomAuth=async()=>{
      try{
        setPhantomAuthPending(true);
        const nonce=await fetchNonce();
        const messageBytes=new TextEncoder().encode(nonce);
        const signedBytes=await (wallet?.adapter as unknown as {signMessage?:(msg:Uint8Array)=>Promise<Uint8Array>})?.signMessage?.(messageBytes);
        if(!signedBytes){setError("Wallet did not sign the message");return}
        const signedMessage=Buffer.from(signedBytes).toString("base64");
        const response=await phantomLogin({publicKey:publicKey.toBase58(),signedMessage,nonce});
        auth.setAuth(response.user);
        beginAccount("wallet");
      }catch(err){setError(err instanceof Error?err.message:"Phantom authentication failed")}
      finally{setPhantomAuthPending(false)}
    };
    if(modal?.entryAsWallet){performPhantomAuth()}
    else{beginAccount("wallet")}
    setAfterConnectPath(modal.afterConnectPath||null);const target=modal.afterConnectPath;setModal(null);if(!localStorage.getItem(NETWORK_NOTICE_KEY))setNoticeOpen(true);else if(target)router.push(target)},[beginAccount,connected,modal,publicKey,router,wallet?.adapter,auth]);
  const openWalletModal=useCallback((options:WalletModalOptions={})=>{setError(null);setModal(options)},[]);
  const chooseWallet=useCallback((name:WalletName)=>{setError(null);select(name);setPendingWallet(name)},[select]);
  const disconnectWallet=useCallback(async()=>{try{await disconnect();setBalance(null);setBalanceStatus("idle")}catch(cause){setError(walletErrorMessage(cause))}},[disconnect]);
  const signOut=useCallback(async()=>{await disconnectWallet();localStorage.removeItem(ACCOUNT_KEY);setAccountMode(null);auth.signOut()},[disconnectWallet,auth]);
  const finishNotice=useCallback(()=>{localStorage.setItem(NETWORK_NOTICE_KEY,"true");setNoticeOpen(false);if(afterConnectPath)router.push(afterConnectPath);setAfterConnectPath(null)},[afterConnectPath,router]);
  const options=useMemo(()=>wallets.filter(item=>item.readyState!==WalletReadyState.Unsupported).map(item=>({name:item.adapter.name,icon:item.adapter.icon,readyState:item.readyState})),[wallets]);
  const value=useMemo(()=>({connected,connecting:connecting||Boolean(pendingWallet)||phantomAuthPending,publicAddress:publicKey?.toBase58()||null,shortAddress:publicKey?shortenWalletAddress(publicKey.toBase58()):null,providerName:wallet?.adapter.name||null,balance,balanceStatus,network:"mainnet-beta" as const,error,wallets:options,modalOpen:Boolean(modal),modalReason:modal?.reason||"",openWalletModal,closeWalletModal:()=>setModal(null),chooseWallet,disconnectWallet,refreshBalance,accountMode,beginAccount,signOut}),[accountMode,balance,balanceStatus,beginAccount,chooseWallet,connected,connecting,disconnectWallet,error,modal,openWalletModal,options,phantomAuthPending,pendingWallet,publicKey,refreshBalance,signOut,wallet?.adapter.name]);
  return <AladdinWalletContext.Provider value={value}>{children}<WalletConnectModal/><NetworkNotice open={noticeOpen} reason={modal?.reason||""} onContinue={finishNotice}/></AladdinWalletContext.Provider>
}
