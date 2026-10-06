'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/app/lib/api';

export interface InsiderLead {
  id: string;
  address: string;
  entryMin: number | null;
  boughtUsd: number;
  soldPct: number | null;
  realizedPnl: number;
  remainingUsd: number;
}

export interface InsiderToken {
  id: string;
  mint: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  color: string;
  stage: string;
  signal: boolean;
  buyers: number;
  cohortSize: number;
  cohortPressure: number | null;
  cohortNetUsd: number;
  cohortAvgSold: number | null;
  lead: InsiderLead | null;
  isNew: boolean;
  isChanged: boolean;
  highSignal: boolean;
  mc: number;
  change: number | null;
  liquidity: number;
  volume: number;
  ageDays: number | null;
  why: string;
}

export interface InsiderMeta {
  count: number;
  source: string;
  fetchedAt: string;
  coverage: string;
  askTarget: string;
}

interface CacheEntry {
  tokens: InsiderToken[];
  meta: InsiderMeta | null;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<{ tokens: InsiderToken[]; meta: InsiderMeta | null }>>();
const CACHE_TTL = 120_000;

async function fetchInsider(limit = 20): Promise<{ tokens: InsiderToken[]; meta: InsiderMeta | null }> {
  const key = `insiders:${limit}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = apiFetch<{ data: InsiderToken[]; meta: InsiderMeta | null }>(
    `/api/insiders?limit=${limit}`
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

interface UseInsiderResult {
  tokens: InsiderToken[];
  meta: InsiderMeta | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: () => void;
}

export function useInsider(limit = 20, enabled = true): UseInsiderResult {
  const key = `insiders:${limit}`;
  const [tokens, setTokens] = useState<InsiderToken[]>(() => cache.get(key)?.tokens ?? []);
  const [meta, setMeta] = useState<InsiderMeta | null>(() => cache.get(key)?.meta ?? null);
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
          const result = await fetchInsider(limit);
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
      const result = await fetchInsider(limit);
      if (mountedRef.current) {
        setTokens(result.tokens);
        setMeta(result.meta);
        setError(null);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch insiders');
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