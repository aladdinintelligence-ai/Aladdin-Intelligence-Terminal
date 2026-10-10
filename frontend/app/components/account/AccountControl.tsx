"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Copy, LogOut, User, WalletCards, X } from "lucide-react";
import { ProfileAvatar } from "./ProfileAvatar";
import { useAladdinWallet } from "@/app/hooks/useAladdinWallet";
import { useAuth } from "@/app/hooks/useAuth";
import { useWalletBalance } from "@/app/hooks/useWalletBalance";
import { EntryModal } from "@/app/components/landing/EntryModal";

function shortenAddress(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function providerLabel(p: string | null) {
  if (p === "google") return "Google";
  if (p === "telegram") return "Telegram";
  if (p === "phantom") return "Phantom";
  return "Unknown";
}

export function AccountControl() {
  const [open, setOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wallet = useAladdinWallet();
  const { user } = useAuth();
  const { balance: solBalance } = useWalletBalance(user?.walletAddress);

  const name = user?.displayName || "";
  const address = user?.walletAddress || "";

  const copyAddress = useCallback(() => {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [address]);

  if (!user) {
    return (
      <div className="accountControl">
        <button className="accountTrigger" onClick={() => setEntryOpen(true)}>
          <ProfileAvatar />
          <span className="accountWallet">
            <b>Sign In</b>
            <small>Create an account or sign in</small>
          </span>
        </button>
        <EntryModal open={entryOpen} onClose={() => setEntryOpen(false)} onAuth={() => setEntryOpen(false)} />
      </div>
    );
  }

  return (
    <div className="accountControl">
      <button
        className="accountTrigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <ProfileAvatar />
        <span className="accountWallet">
          <b>{name}</b>
          <small>{address ? shortenAddress(address) : "No wallet"}</small>
        </span>
        <ChevronDown />
      </button>
      {open ? (
        <div className="accountMenu">
          <header>
            <ProfileAvatar className="largeAvatar" />
            <div>
              <b>{name}</b>
              <small>@{user.username}</small>
            </div>
            <button
              aria-label="Close account menu"
              onClick={() => setOpen(false)}
            >
              <X />
            </button>
          </header>
          <section>
            <small>TRADING WALLET</small>
            <p className="walletProvider">
              <span>{providerLabel(user.authProvider)}</span>
              <b>● MAINNET</b>
            </p>
            {address ? (
              <>
                <code className="walletAddressRow" title={address}>
                  {shortenAddress(address)}
                  <button type="button" className="copyAddressBtn" onClick={copyAddress} aria-label="Copy address">
                    {copied ? <Check size={12} /> : <Copy size={22} />}
                  </button>
                </code>
                <p>
                  {solBalance !== null ? `${solBalance.toFixed(1)} SOL` : "Loading balance..."}
                </p>
                <small>ALADDIN CREDITS</small>
                <p>0.00</p>
              </>
            ) : (
              <p className="walletDisconnected">No wallet generated yet.</p>
            )}
          </section>
          <nav>
            <Link
              href="/settings?section=profile"
              onClick={() => setOpen(false)}
            >
              <User />
              Profile
            </Link>
            <Link
              href="/settings?section=account"
              onClick={() => setOpen(false)}
            >
              <WalletCards />
              Wallet Details
            </Link>
            <button onClick={() => void wallet.signOut()}>
              <LogOut />
              Disconnect Wallet
              <span style={{ display: "none" }}>Sign Out</span>
            </button>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
