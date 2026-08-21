import { apiFetch } from '@/app/lib/api';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: number;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
    };
    percent: number;
  }>;
}

export interface SwapResult {
  signature: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  explorerUrl: string;
}

export interface WalletBalance {
  publicKey: string;
  solBalance: number;
  tokens: Array<{
    mint: string;
    amount: number;
    decimals: number;
    uiAmountString: string;
  }>;
}

export interface TradeHistoryEntry {
  _id: string;
  tokenMint: string;
  walletAddress: string;
  transactionSignature: string;
  side: 'buy' | 'sell';
  blockTime: string;
  solAmount: number;
  usdAmount: number;
  tokenAmount: number;
  priceUsd: number | null;
  provider: string;
}

export async function fetchSwapQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: number | string;
  slippageBps?: number;
}): Promise<SwapQuote> {
  return apiFetch<SwapQuote>('/api/swap/quote', {
    method: 'POST',
    body: JSON.stringify({ ...params, amount: String(params.amount) }),
  });
}

export async function executeSwap(params: {
  inputMint: string;
  outputMint: string;
  amount: number | string;
  slippageBps?: number;
}): Promise<SwapResult> {
  return apiFetch<SwapResult>('/api/swap', {
    method: 'POST',
    body: JSON.stringify({ ...params, amount: String(params.amount) }),
  });
}

export async function fetchWalletBalance(): Promise<WalletBalance> {
  return apiFetch<WalletBalance>('/api/swap/balance');
}

export async function fetchTradeHistory(params?: {
  limit?: number;
  offset?: number;
}): Promise<{ trades: TradeHistoryEntry[]; total: number; limit: number; offset: number }> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiFetch(`/api/swap/history${qs ? `?${qs}` : ''}`);
}

export async function fetchTokenPrice(mint: string): Promise<{ mint: string; price: number | null }> {
  return apiFetch(`/api/swap/price/${mint}`);
}

export { SOL_MINT };
