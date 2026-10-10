"use client";
import { createContext, useContext } from "react";
import type { AladdinWalletState } from "@/app/types/wallet";

export const AladdinWalletContext = createContext<AladdinWalletState | null>(
  null,
);
export function useAladdinWallet() {
  const value = useContext(AladdinWalletContext);
  if (!value)
    throw new Error("useAladdinWallet must be used inside SolanaProvider");
  return value;
}
