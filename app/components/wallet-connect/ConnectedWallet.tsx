"use client";
import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useAuth } from "@/app/hooks/useAuth";
import { useWalletBalance } from "@/app/hooks/useWalletBalance";

function shortenAddress(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function providerLabel(p: string | null) {
  if (p === "google") return "Google";
  if (p === "telegram") return "Telegram";
  if (p === "phantom") return "Phantom";
  return "Wallet";
}

export function ConnectedWallet() {
  const { user } = useAuth();
  const { balance } = useWalletBalance(user?.walletAddress);
  const [copied, setCopied] = useState(false);

  const copyAddress = useCallback(() => {
    if (!user?.walletAddress) return;
    navigator.clipboard.writeText(user.walletAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [user?.walletAddress]);

  if (!user?.walletAddress) {
    return (
      <div className="connectedWalletPanel disconnected">
        <small>TRADING WALLET</small>
        <b>No wallet</b>
        <p>Sign in and generate a wallet to start trading.</p>
      </div>
    );
  }

  return (
    <div className="connectedWalletPanel">
      <small>TRADING WALLET</small>
      <b>{providerLabel(user.authProvider)}</b>
      <code className="walletAddressRow">
        {shortenAddress(user.walletAddress)}
        <button type="button" className="copyAddressBtn" onClick={copyAddress} aria-label="Copy address">
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </code>
      <p>{balance !== null ? `${balance.toFixed(4)} SOL` : "Loading..."}</p>
      <span className="mainnetState"><i/>Solana Mainnet</span>
    </div>
  );
}
