import type { WalletName, WalletReadyState } from "@solana/wallet-adapter-base";

export type AladdinAccountMode =
  | "demo"
  | "google"
  | "telegram"
  | "wallet"
  | null;
export type DevnetTransactionStatus =
  | "closed"
  | "review"
  | "preparing"
  | "signing"
  | "confirming"
  | "confirmed"
  | "error";
export interface DevnetTransactionState {
  status: DevnetTransactionStatus;
  amountSol: number;
  signature: string | null;
  error: string | null;
}
export interface WalletOption {
  name: WalletName;
  icon: string;
  readyState: WalletReadyState;
}
export interface WalletModalOptions {
  reason?: string;
  entryAsWallet?: boolean;
  afterConnectPath?: string;
}
export interface AladdinWalletState {
  connected: boolean;
  connecting: boolean;
  publicAddress: string | null;
  shortAddress: string | null;
  providerName: string | null;
  balance: number | null;
  balanceStatus: "idle" | "loading" | "ready" | "unavailable";
  network: "mainnet-beta";
  error: string | null;
  wallets: WalletOption[];
  modalOpen: boolean;
  modalReason: string;
  accountMode: AladdinAccountMode;
  openWalletModal: (options?: WalletModalOptions) => void;
  closeWalletModal: () => void;
  chooseWallet: (name: WalletName) => void;
  disconnectWallet: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  beginAccount: (mode: Exclude<AladdinAccountMode, null>) => void;
  signOut: () => Promise<void>;
  devnetTransaction: DevnetTransactionState;
  openDevnetTransaction: () => void;
  closeDevnetTransaction: () => void;
  submitDevnetTransaction: () => Promise<void>;
}
