'use client';
import { useEffect, useRef, useState } from 'react';

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

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export function useTokenInfo(mint: string | null, pollInterval = 15000) {
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mintRef = useRef(mint);
  mintRef.current = mint;

  useEffect(() => {
    if (!mint) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setToken(null);

    const fetchToken = async (isPoll = false) => {
      try {
        const res = await fetch(`${API_URL}/api/token-info/${mintRef.current}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Request failed with status ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) { setToken(data); setError(null); }
      } catch (err) {
        if (!cancelled && !isPoll) {
          setError(err instanceof Error ? err.message : 'Failed to load token');
        }
      } finally {
        if (!cancelled && !isPoll) setLoading(false);
      }
    };

    fetchToken(false);

    intervalRef.current = setInterval(() => fetchToken(true), pollInterval);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [mint, pollInterval]);

  return { token, loading, error };
}
