import { apiFetch } from "@/app/lib/api";

export interface TokenSearchResult {
  mint: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  priceUsd: number | null;
  priceChange24h: number | null;
  volume24h: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  pairAddress: string | null;
  dexId: string | null;
  pairCreatedAt: number | null;
  url: string | null;
}

export async function searchTokens(
  query: string,
  signal?: AbortSignal,
): Promise<TokenSearchResult[]> {
  const q = encodeURIComponent(query.trim().slice(0, 100));
  if (!q) return [];
  return apiFetch<TokenSearchResult[]>(`/api/search?q=${q}`, { signal });
}