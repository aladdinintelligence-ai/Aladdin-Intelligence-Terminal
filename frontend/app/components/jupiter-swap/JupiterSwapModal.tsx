"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowDownUp,Settings,ExternalLink,AlertTriangle,CheckCircle2,X,ChevronDown,Wallet} from "lucide-react";
import {useAuth} from "@/app/hooks/useAuth";
import type {LaunchToken} from "@/app/types/launches";
import {
  fetchSwapQuote,
  executeSwap,
  fetchWalletBalance,
  SOL_MINT,
  type SwapQuote,
  type WalletBalance,
} from "@/app/services/jupiter-swap";

const SLIPPAGE_OPTIONS=[0.1,0.5,1,2];
const REFRESH_INTERVAL=15000;

type SwapStatus="idle"|"quoting"|"confirming"|"signing"|"success"|"error";

interface JupiterSwapModalProps{
  token:LaunchToken|null;
  onClose:()=>void;
  onAuthRequired:()=>void;
}

export function JupiterSwapModal({token,onClose,onAuthRequired}:JupiterSwapModalProps){
  const{user}=useAuth();
  const[side,setSide]=useState<"buy"|"sell">("buy");
  const[inputAmount,setInputAmount]=useState("");
  const[slippage,setSlippage]=useState(0.5);
  const[showSettings,setShowSettings]=useState(false);
  const[quote,setQuote]=useState<SwapQuote|null>(null);
  const[quoteError,setQuoteError]=useState<string|null>(null);
  const[balance,setBalance]=useState<WalletBalance|null>(null);
  const[status,setStatus]=useState<SwapStatus>("idle");
  const[resultSignature,setResultSignature]=useState<string|null>(null);
  const[errorMessage,setErrorMessage]=useState<string|null>(null);

  const inputMint=useMemo(()=>{
    if(side==="buy") return SOL_MINT;
    return token?.mint??"";
  },[side,token?.mint]);

  const outputMint=useMemo(()=>{
    if(side==="buy") return token?.mint??"";
    return SOL_MINT;
  },[side,token?.mint]);

  const inputSymbol=useMemo(()=>{
    if(side==="buy") return "SOL";
    return token?.symbol??"";
  },[side,token?.symbol]);

  const outputSymbol=useMemo(()=>{
    if(side==="buy") return token?.symbol??"";
    return "SOL";
  },[side,token?.symbol]);

  const inputBalance=useMemo(()=>{
    if(!balance) return 0;
    if(side==="buy") return balance.solBalance;
    const found=balance.tokens.find(t=>t.mint===token?.mint);
    return found?.amount??0;
  },[balance,side,token?.mint]);

  const outputBalance=useMemo(()=>{
    if(!balance) return 0;
    if(side==="buy"){
      const found=balance.tokens.find(t=>t.mint===token?.mint);
      return found?.amount??0;
    }
    return balance.solBalance;
  },[balance,side,token?.mint]);

  // Load balance
  const loadBalance=useCallback(async()=>{
    if(!user)return;
    try{const b=await fetchWalletBalance();setBalance(b)}catch{}
  },[user]);

  useEffect(()=>{loadBalance()},[loadBalance]);

  // Fetch quote
  useEffect(()=>{
    if(!inputAmount||Number(inputAmount)<=0||!inputMint||!outputMint){
      setQuote(null);setQuoteError(null);return;
    }
    let cancelled=false;
    const amountRaw=BigInt(Math.round(Number(inputAmount)*(inputMint===SOL_MINT?1e9:1e6)));
    setStatus("quoting");
    fetchSwapQuote({inputMint,outputMint,amount:String(amountRaw),slippageBps:Math.round(slippage*100)})
      .then(q=>{if(!cancelled){setQuote(q);setQuoteError(null);setStatus("idle")}})
      .catch(e=>{if(!cancelled){setQuoteError(e instanceof Error?e.message:"Quote failed");setQuote(null);setStatus("idle")}});
    return()=>{cancelled=true};
  },[inputAmount,inputMint,outputMint,slippage]);

  // Refresh quote periodically
  useEffect(()=>{
    if(!quote||!inputAmount)return;
    const id=setInterval(()=>{
      const amountRaw=BigInt(Math.round(Number(inputAmount)*(inputMint===SOL_MINT?1e9:1e6)));
      fetchSwapQuote({inputMint,outputMint,amount:String(amountRaw),slippageBps:Math.round(slippage*100)})
        .then(q=>{setQuote(q);setQuoteError(null)})
        .catch(()=>{});
    },REFRESH_INTERVAL);
    return()=>clearInterval(id);
  },[quote,inputAmount,inputMint,outputMint,slippage]);

  const handleSwapSide=useCallback(()=>{
    setSide(s=>s==="buy"?"sell":"buy");
    setInputAmount("");setQuote(null);setQuoteError(null);
  },[]);

  const handleMaxClick=useCallback(()=>{
    if(!inputBalance)return;
    if(side==="buy"){
      const max=inputBalance-0.005;
      setInputAmount(max>0?max.toFixed(4):"");
    }else{
      setInputAmount(String(inputBalance));
    }
  },[inputBalance,side]);

  const handleSubmit=useCallback(async()=>{
    if(!user){onAuthRequired();return}
    if(!quote||!inputMint||!outputMint||!inputAmount)return;

    // Balance check
    const amountNum=Number(inputAmount);
    if(side==="buy"&&inputMint===SOL_MINT){
      // Buying with SOL — need enough SOL + fees
      const feeReserve=0.01;
      if(amountNum+feeReserve>inputBalance){
        setErrorMessage(`Insufficient SOL balance. You need ${(amountNum+feeReserve).toFixed(4)} SOL but have ${inputBalance.toFixed(4)} SOL.`);
        setStatus("error");
        return;
      }
    }else{
      // Selling token — need enough tokens
      if(amountNum>inputBalance){
        setErrorMessage(`Insufficient token balance. You need ${amountNum} but have ${inputBalance}.`);
        setStatus("error");
        return;
      }
    }

    try{
      setStatus("signing");setErrorMessage(null);
      const amountRaw=BigInt(Math.round(Number(inputAmount)*(inputMint===SOL_MINT?1e9:1e6)));
      const result=await executeSwap({inputMint,outputMint,amount:String(amountRaw),slippageBps:Math.round(slippage*100)});
      setResultSignature(result.signature);setStatus("success");
      loadBalance();
    }catch(e){
      setErrorMessage(e instanceof Error?e.message:"Swap failed");setStatus("error");
    }
  },[user,quote,inputMint,outputMint,inputAmount,slippage,onAuthRequired,loadBalance,inputBalance,side]);

  const handleClose=useCallback(()=>{
    if(status==="signing")return;
    onClose();
  },[status,onClose]);

  if(!token)return null;

  const outAmount=quote?Number(quote.outAmount)/(outputMint===SOL_MINT?1e9:1e6):0;
  const priceImpact=Number(quote?.priceImpactPct??0);
  const highImpact=priceImpact>5;
  const busy=status==="signing"||status==="confirming";

  return<div className="jupModalBackdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)handleClose()}}>
    <section className="jupModal" role="dialog" aria-modal="true" aria-labelledby="jup-swap-title">
      <header className="jupModalHeader">
        <h2 id="jup-swap-title">{side==="buy"?"Buy":"Sell"} {token.symbol}</h2>
        <div className="jupModalHeaderActions">
          <button type="button" className="jupSettingsBtn" onClick={()=>setShowSettings(!showSettings)} aria-label="Settings">
            <Settings size={16}/>
          </button>
          <button type="button" className="jupCloseBtn" onClick={handleClose} disabled={busy} aria-label="Close">
            <X size={16}/>
          </button>
        </div>
      </header>

      {showSettings&&<div className="jupSlippagePanel">
        <span>Slippage Tolerance</span>
        <div className="jupSlippageOptions">
          {SLIPPAGE_OPTIONS.map(v=>(
            <button key={v} type="button" className={slippage===v?"active":""} onClick={()=>setSlippage(v)}>
              {v}%
            </button>
          ))}
          <input type="number" min="0" max="50" step="0.1" value={slippage} onChange={e=>setSlippage(Number(e.target.value)||0.5)}/>
        </div>
      </div>}

      {!user&&<div className="jupAuthBanner" onClick={onAuthRequired}>
        <Wallet size={14}/>
        <span>Sign in to trade with your wallet</span>
        <ChevronDown size={14}/>
      </div>}

      <div className="jupSwapContainer">
        <div className="jupSwapInputCard">
          <div className="jupSwapInputLabel">
            <span>{side==="buy"?"You pay":"You receive"}</span>
            <span className="jupSwapBalance" onClick={handleMaxClick}>
              Balance: {inputBalance>0?(side==="buy"?inputBalance.toFixed(4):inputBalance.toFixed(2)):"0"}
            </span>
          </div>
          <div className="jupSwapInputRow">
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={inputAmount}
              onChange={e=>{setInputAmount(e.target.value);setStatus("idle")}}
              disabled={busy}
            />
            <div className="jupSwapTokenTag">
              {side==="buy"?"◎":<span className="jupTokenIcon">{token.symbol.slice(0,2)}</span>}
              <span>{inputSymbol}</span>
            </div>
          </div>
        </div>

        <button type="button" className="jupFlipBtn" onClick={handleSwapSide} disabled={busy} aria-label="Flip token">
          <ArrowDownUp size={16}/>
        </button>

        <div className="jupSwapOutputCard">
          <div className="jupSwapInputLabel">
            <span>{side==="buy"?"You receive":"You pay"}</span>
            <span className="jupSwapBalance">
              Balance: {outputBalance>0?(side==="buy"?outputBalance.toFixed(2):outputBalance.toFixed(4)):"0"}
            </span>
          </div>
          <div className="jupSwapInputRow">
            <input
              type="number"
              placeholder="0"
              value={outAmount>0?(side==="buy"?outAmount.toFixed(2):outAmount.toFixed(4)):""}
              readOnly
              disabled
            />
            <div className="jupSwapTokenTag">
              {side==="sell"?"◎":<span className="jupTokenIcon">{token.symbol.slice(0,2)}</span>}
              <span>{outputSymbol}</span>
            </div>
          </div>
        </div>
      </div>

      {quote&&<div className="jupRouteInfo">
        <div className="jupRouteRow">
          <span>Route</span>
          <span>{quote.routePlan.map(r=>r.swapInfo.label).join(" → ")}</span>
        </div>
        <div className="jupRouteRow">
          <span>Price Impact</span>
          <span className={highImpact?"jupHighImpact":""}>{priceImpact.toFixed(2)}%</span>
        </div>
        <div className="jupRouteRow">
          <span>Slippage</span>
          <span>{slippage}%</span>
        </div>
        {quote.otherAmountThreshold&&<div className="jupRouteRow">
          <span>Min Received</span>
          <span>{(Number(quote.otherAmountThreshold)/(outputMint===SOL_MINT?1e9:1e6)).toFixed(6)} {outputSymbol}</span>
        </div>}
      </div>}

      {quoteError&&<div className="jupErrorBanner">
        <AlertTriangle size={14}/>
        <span>{quoteError}</span>
      </div>}

      {highImpact&&<div className="jupWarningBanner">
        <AlertTriangle size={14}/>
        <span>High price impact! This trade may result in significant slippage.</span>
      </div>}

      {status==="success"&&resultSignature&&<div className="jupSuccessBanner">
        <CheckCircle2 size={16}/>
        <div>
          <span>Swap confirmed!</span>
          <a href={`https://explorer.solana.com/tx/${resultSignature}`} target="_blank" rel="noreferrer">
            View on Explorer <ExternalLink size={12}/>
          </a>
        </div>
      </div>}

      {errorMessage&&status==="error"&&<div className="jupErrorBanner">
        <AlertTriangle size={14}/>
        <span>{errorMessage}</span>
      </div>}

      <div className="jupModalFooter">
        {status==="success"?(
          <button type="button" className="jupDoneBtn" onClick={handleClose}>Done</button>
        ):(
          (()=>{
            const insufficient=side==="buy"&&inputMint===SOL_MINT
              ?Number(inputAmount)+0.01>inputBalance
              :Number(inputAmount)>inputBalance;
            const noBalance=inputBalance<=0;
            const disabled=busy||!quote||!inputAmount||Number(inputAmount)<=0||!!quoteError||insufficient;
            const label=busy?"Confirming swap..."
              :!user?"Sign in to swap"
              :noBalance?"Insufficient balance — top up SOL"
              :insufficient?`Need ${(Number(inputAmount)+0.01).toFixed(4)} ${inputSymbol}`
              :"Swap";
            return <button type="button" className={`jupSwapBtn${highImpact?" jupSwapBtnWarn":""}${insufficient||noBalance?" jupSwapBtnDisabled":""}`} onClick={handleSubmit} disabled={disabled}>{label}</button>;
          })()
        )}
      </div>

      {status==="success"&&<button type="button" className="jupNewSwapBtn" onClick={()=>{setInputAmount("");setQuote(null);setStatus("idle");setResultSignature(null)}}>
        New Swap
      </button>}
    </section>
  </div>;
}
