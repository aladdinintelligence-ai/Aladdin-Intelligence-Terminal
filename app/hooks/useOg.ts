'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/app/lib/api';

export interface OgToken {
  id: string;
  mint: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  color: string;
  formation: string;
  buyers: number;
  mc: number;
  change: number | null;
  liquidity: number;
  volume: number;
  holders: number;
  top10: number;
  ageDays: number | null;
  isNew: boolean;
  isChanged: boolean;
  highSignal: boolean;
  behaviouralChange: string;
  whyItMatters: string;
}

export interface OgMeta {
  count: number;
  source: string;
  fetchedAt: string;
  coverage: string;
  askTarget: string;
  stale?: boolean;
}

interface CacheEntry {
  tokens: OgToken[];
  meta: OgMeta | null;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<{ tokens: OgToken[]; meta: OgMeta | null }>>();
const CACHE_TTL = 120_000;

async function fetchOg(limit = 20): Promise<{ tokens: OgToken[]; meta: OgMeta | null }> {
  const key = `og:${limit}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = apiFetch<{ data: OgToken[]; meta: OgMeta | null }>(
    `/api/og?limit=${limit}`
  ).then(r => ({ tokens: r.data || [], meta: r.meta || null }));

  inflight.set(key, promise);
  try {
    const result = await promise;
    cache.set(key, { tokens: result.tokens, meta: result.meta, timestamp: Date.now() });
    return result;
  } finally {
    inflight.delete(key);
  }
}

interface UseOgResult {
  tokens: OgToken[];
  meta: OgMeta | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: () => void;
}

export function useOg(limit = 20, enabled = true): UseOgResult {
  const key = `og:${limit}`;
  const [tokens, setTokens] = useState<OgToken[]>(() => cache.get(key)?.tokens ?? []);
  const [meta, setMeta] = useState<OgMeta | null>(() => cache.get(key)?.meta ?? null);
  const [loading, setLoading] = useState(() => enabled && !cache.has(key));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const doFetch = useCallback(async (isRefresh = false) => {
    if (!enabled) return;

    const cached = cache.get(key);
    const fresh = cached && Date.now() - cached.timestamp < CACHE_TTL;

    if (fresh) {
      if (isRefresh) {
        setRefreshing(true);
        try {
          const result = await fetchOg(limit);
          if (mountedRef.current) {
            setTokens(result.tokens);
            setMeta(result.meta);
          }
        } catch { /* silent */ }
        if (mountedRef.current) setRefreshing(false);
      }
      return;
    }

    if (cached) {
      setTokens(cached.tokens);
      setMeta(cached.meta);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const result = await fetchOg(limit);
      if (mountedRef.current) {
        setTokens(result.tokens);
        setMeta(result.meta);
        setError(null);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch OG workspace');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [limit, key, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    doFetch(false);

    const interval = setInterval(() => doFetch(true), CACHE_TTL);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [doFetch]);

  return { tokens, meta, loading, refreshing, error, refetch: () => doFetch(false) };
}