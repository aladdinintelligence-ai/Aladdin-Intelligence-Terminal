'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/app/lib/api';

export interface ClusterMember {
  id: string;
  address: string;
  tokenCount: number;
}

export interface ClusterTokenRef {
  mint: string;
  symbol: string;
}

export interface ClusterToken {
  id: string;
  name: string;
  color: string;
  walletCount: number;
  tokenCount: number;
  sharedTokenCount: number;
  coMovements: number;
  members: ClusterMember[];
  topTokens: ClusterTokenRef[];
  representativeMint: string;
  representativeSymbol: string;
  netUsd: number;
  pressure: number | null;
  buyUsd: number;
  sellUsd: number;
  firstSeen: string;
  lastSeen: string;
  stage: string;
  signal: boolean;
  isNew: boolean;
  isChanged: boolean;
  highSignal: boolean;
  why: string;
}

export interface ClusterMeta {
  count: number;
  source: string;
  fetchedAt: string;
  coverage: string;
  askTarget: string;
}

interface CacheEntry {
  tokens: ClusterToken[];
  meta: ClusterMeta | null;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<{ tokens: ClusterToken[]; meta: ClusterMeta | null }>>();
const CACHE_TTL = 120_000;

async function fetchClusters(limit = 20): Promise<{ tokens: ClusterToken[]; meta: ClusterMeta | null }> {
  const key = `clusters:${limit}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = apiFetch<{ data: ClusterToken[]; meta: ClusterMeta | null }>(
    `/api/clusters?limit=${limit}`
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

interface UseClustersResult {
  tokens: ClusterToken[];
  meta: ClusterMeta | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: () => void;
}

export function useClusters(limit = 20, enabled = true): UseClustersResult {
  const key = `clusters:${limit}`;
  const [tokens, setTokens] = useState<ClusterToken[]>(() => cache.get(key)?.tokens ?? []);
  const [meta, setMeta] = useState<ClusterMeta | null>(() => cache.get(key)?.meta ?? null);
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
          const result = await fetchClusters(limit);
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
      const result = await fetchClusters(limit);
      if (mountedRef.current) {
        setTokens(result.tokens);
        setMeta(result.meta);
        setError(null);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch clusters');
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