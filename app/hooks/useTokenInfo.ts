'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/app/lib/api';

export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  volume6h: number | null;
  volume1h: number | null;
  priceChange24h: number | null;
  priceChange6h: number | null;
  priceChange1h: number | null;
  txns24h: { buys: number; sells: number } | null;
  pairAddress: string | null;
  dexId: string | null;
  pairCreatedAt: number | null;
  url: string | null;
  website: string | null;
  socials: Array<{ type: string; url: string }>;
}

export function useTokenInfo(mint: string | null) {
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mint) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch<TokenInfo>(`/api/token-info/${mint}`)
      .then((data) => {
        if (!cancelled) {
          setToken(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load token');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [mint]);

  return { token, loading, error };
}
