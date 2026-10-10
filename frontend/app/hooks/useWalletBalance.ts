"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/app/lib/api";

interface BalanceResponse {
  publicKey: string;
  solBalance: number;
  tokens: Array<{
    mint: string;
    amount: number;
    decimals: number;
    uiAmountString: string;
  }>;
}

export function useWalletBalance(walletAddress: string | null | undefined) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      setBalance(null);
      fetchedRef.current = null;
      return;
    }

    // Skip if we already fetched for this address
    if (fetchedRef.current === walletAddress && balance !== null) return;

    let cancelled = false;
    setLoading(true);

    apiFetch<BalanceResponse>("/api/swap/balance")
      .then((data) => {
        if (!cancelled) {
          setBalance(data.solBalance);
          fetchedRef.current = walletAddress;
        }
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [walletAddress, balance]);

  // Refresh function for manual triggers
  const refresh = () => {
    if (!walletAddress) return;
    fetchedRef.current = null;
    setLoading(true);
    apiFetch<BalanceResponse>("/api/swap/balance")
      .then((data) => { setBalance(data.solBalance); fetchedRef.current = walletAddress; })
      .catch(() => setBalance(null))
      .finally(() => setLoading(false));
  };

  return { balance, loading, refresh };
}
