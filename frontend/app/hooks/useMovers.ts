'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/app/lib/api';

export interface MoverToken {
  id: string;
  mint: string;
  symbol: string;
  name: string;
  mc: number;
  liquidity: number;
  volume: number;
  buyers: number;
  formation: string;
  change: number;
  color: string;
  imageUrl: string | null;
}

interface CacheEntry {
  tokens: MoverToken[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<MoverToken[]>>();
const CACHE_TTL = 120_000;

async function fetchMovers(limit = 20): Promise<MoverToken[]> {
  const key = `movers:${limit}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = apiFetch<{ data: MoverToken[]; meta: unknown }>(
    `/api/movers?limit=${limit}`
  ).then(r => r.data || []);

  inflight.set(key, promise);
  try {
    const tokens = await promise;
    cache.set(key, { tokens, timestamp: Date.now() });
    return tokens;
  } finally {
    inflight.delete(key);
  }
}

interface UseMoversResult {
  tokens: MoverToken[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMovers(limit = 20): UseMoversResult {
  const key = `movers:${limit}`;
  const [tokens, setTokens] = useState<MoverToken[]>(() => cache.get(key)?.tokens ?? []);
  const [loading, setLoading] = useState(() => !cache.has(key));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const doFetch = useCallback(async (isRefresh = false) => {
    const cached = cache.get(key);
    const fresh = cached && Date.now() - cached.timestamp < CACHE_TTL;

    if (fresh) {
      if (isRefresh) {
        setRefreshing(true);
        try {
          const newTokens = await fetchMovers(limit);
          if (mountedRef.current) setTokens(newTokens);
        } catch { /* silent */ }
        if (mountedRef.current) setRefreshing(false);
      }
      return;
    }

    if (cached) {
      setTokens(cached.tokens);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const newTokens = await fetchMovers(limit);
      if (mountedRef.current) {
        setTokens(newTokens);
        setError(null);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch movers');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [limit, key]);

  useEffect(() => {
    mountedRef.current = true;
    doFetch(false);

    const interval = setInterval(() => doFetch(true), CACHE_TTL);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [doFetch]);

  return { tokens, loading, refreshing, error, refetch: () => doFetch(false) };
}
