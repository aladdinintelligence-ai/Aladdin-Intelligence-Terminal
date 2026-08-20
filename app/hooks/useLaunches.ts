'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LaunchToken } from '@/app/types/launches';
import { apiFetch } from '@/app/lib/api';

interface CacheEntry {
  tokens: LaunchToken[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<LaunchToken[]>>();
const CACHE_TTL = 30_000;

async function fetchTab(tab: string): Promise<LaunchToken[]> {
  const existing = inflight.get(tab);
  if (existing) return existing;

  const promise = apiFetch<{ data: LaunchToken[]; meta: unknown }>(
    `/api/launches?tab=${tab.toLowerCase().replace(/\s+/g, '-')}&limit=50`
  ).then(r => r.data || []);

  inflight.set(tab, promise);
  try {
    const tokens = await promise;
    cache.set(tab, { tokens, timestamp: Date.now() });
    return tokens;
  } finally {
    inflight.delete(tab);
  }
}

interface UseLaunchesResult {
  tokens: LaunchToken[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: () => void;
}

export function useLaunches(tab: string): UseLaunchesResult {
  const [tokens, setTokens] = useState<LaunchToken[]>(() => cache.get(tab)?.tokens ?? []);
  const [loading, setLoading] = useState(() => !cache.has(tab));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const doFetch = useCallback(async (isRefresh = false) => {
    const t = tabRef.current;
    const cached = cache.get(t);
    const fresh = cached && Date.now() - cached.timestamp < CACHE_TTL;

    if (fresh) {
      if (isRefresh) {
        setRefreshing(true);
        try {
          const newTokens = await fetchTab(t);
          if (mountedRef.current && tabRef.current === t) {
            setTokens(newTokens);
          }
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
      const newTokens = await fetchTab(t);
      if (mountedRef.current && tabRef.current === t) {
        setTokens(newTokens);
        setError(null);
      }
    } catch (err: unknown) {
      if (mountedRef.current && tabRef.current === t) {
        setError(err instanceof Error ? err.message : 'Failed to fetch launches');
      }
    } finally {
      if (mountedRef.current && tabRef.current === t) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    doFetch(false);

    const interval = setInterval(() => doFetch(true), CACHE_TTL);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [tab, doFetch]);

  return { tokens, loading, refreshing, error, refetch: () => doFetch(false) };
}
