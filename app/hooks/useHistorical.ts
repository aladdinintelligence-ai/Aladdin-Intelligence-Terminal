"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/app/lib/api";

export interface HistoricalTopMatch {
  symbol: string;
  similarity: number;
  peak: number | null;
  outcome: string;
  difference: string;
}

export interface HistoricalToken {
  id: string;
  mint: string;
  symbol: string;
  name: string;
  color: string;
  imageUrl: string | null;
  formation: string;
  mc: number | null;
  change: number | null;
  liquidity: number | null;
  volume: number | null;
  ageDays: number | null;
  buyers: number | null;
  top1: number | null;
  top10: number | null;
  profitable: number | null;
  retained: number | null;
  migration: number | null;
  peak: number | null;
  matchCount: number;
  similarity: number | null;
  medianPeak: number | null;
  successful: number;
  failed: number;
  signal: boolean;
  isNew: boolean;
  isChanged: boolean;
  why: string;
  topMatch: HistoricalTopMatch | null;
  differences: string[];
}

export interface HistoricalHero {
  analyzed: number;
  matches: number;
  medianPeak: number | null;
  medianSimilarity: number;
  successful: number;
  failed: number;
  flat: number;
}

export interface HistoricalMeta {
  count: number;
  source: string;
  fetchedAt: string;
  coverage: string;
  askTarget: string;
  stale?: boolean;
}

interface HistoricalResponse {
  tokens: HistoricalToken[];
  hero: HistoricalHero | null;
  meta: HistoricalMeta | null;
}

interface CacheEntry {
  tokens: HistoricalToken[];
  hero: HistoricalHero | null;
  meta: HistoricalMeta | null;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<HistoricalResponse>>();
const CACHE_TTL = 120_000;

async function fetchHistorical(limit = 6): Promise<HistoricalResponse> {
  const key = `historical:${limit}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = apiFetch<{ data: HistoricalToken[]; hero: HistoricalHero | null; meta: HistoricalMeta | null }>(
    `/api/historical?limit=${limit}`
  ).then(r => ({ tokens: r.data || [], hero: r.hero || null, meta: r.meta || null }));

  inflight.set(key, promise);
  try {
    const result = await promise;
    cache.set(key, { tokens: result.tokens, hero: result.hero, meta: result.meta, timestamp: Date.now() });
    return result;
  } finally {
    inflight.delete(key);
  }
}

interface UseHistoricalResult {
  tokens: HistoricalToken[];
  hero: HistoricalHero | null;
  meta: HistoricalMeta | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: () => void;
}

export function useHistorical(limit = 6, enabled = true): UseHistoricalResult {
  const key = `historical:${limit}`;
  const [tokens, setTokens] = useState<HistoricalToken[]>(() => cache.get(key)?.tokens ?? []);
  const [hero, setHero] = useState<HistoricalHero | null>(() => cache.get(key)?.hero ?? null);
  const [meta, setMeta] = useState<HistoricalMeta | null>(() => cache.get(key)?.meta ?? null);
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
          const result = await fetchHistorical(limit);
          if (mountedRef.current) {
            setTokens(result.tokens);
            setHero(result.hero);
            setMeta(result.meta);
          }
        } catch { /* silent */ }
        if (mountedRef.current) setRefreshing(false);
      }
      return;
    }

    if (cached) {
      setTokens(cached.tokens);
      setHero(cached.hero);
      setMeta(cached.meta);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const result = await fetchHistorical(limit);
      if (mountedRef.current) {
        setTokens(result.tokens);
        setHero(result.hero);
        setMeta(result.meta);
        setError(null);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to fetch historical matches");
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

  return { tokens, hero, meta, loading, refreshing, error, refetch: () => doFetch(false) };
}