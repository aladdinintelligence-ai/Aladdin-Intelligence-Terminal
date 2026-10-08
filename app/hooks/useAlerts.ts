"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/app/lib/api";

export interface AlertItem {
  id: string;
  type: string;
  key: string;
  severity: string;
  signal: boolean;
  isNew: boolean;
  isChanged: boolean;
  mint: string;
  symbol: string;
  name: string;
  color: string;
  imageUrl: string | null;
  mc: number;
  liquidity: number;
  volume24h: number;
  change24h: number | null;
  usd: number | null;
  detail: string;
  wallets: string[];
  time: string;
  why: string;
}

export interface AlertsMeta {
  count: number;
  signalCount: number;
  source: string;
  fetchedAt: string;
  coverage: string;
  askTarget: string;
  stale?: boolean;
}

interface CacheEntry {
  alerts: AlertItem[];
  meta: AlertsMeta | null;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<{ alerts: AlertItem[]; meta: AlertsMeta | null }>>();
const CACHE_TTL = 60_000;

async function fetchAlerts(limit = 20): Promise<{ alerts: AlertItem[]; meta: AlertsMeta | null }> {
  const key = `alerts:${limit}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = apiFetch<{ data: AlertItem[]; meta: AlertsMeta | null }>(`/api/alerts?limit=${limit}`).then(
    r => ({ alerts: r.data || [], meta: r.meta || null })
  );

  inflight.set(key, promise);
  try {
    const result = await promise;
    cache.set(key, { alerts: result.alerts, meta: result.meta, timestamp: Date.now() });
    return result;
  } finally {
    inflight.delete(key);
  }
}

interface UseAlertsResult {
  alerts: AlertItem[];
  meta: AlertsMeta | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAlerts(limit = 20, enabled = true): UseAlertsResult {
  const key = `alerts:${limit}`;
  const [alerts, setAlerts] = useState<AlertItem[]>(() => cache.get(key)?.alerts ?? []);
  const [meta, setMeta] = useState<AlertsMeta | null>(() => cache.get(key)?.meta ?? null);
  const [loading, setLoading] = useState(() => enabled && !cache.has(key));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const doFetch = useCallback(
    async (isRefresh = false) => {
      if (!enabled) return;

      const cached = cache.get(key);
      const fresh = cached && Date.now() - cached.timestamp < CACHE_TTL;

      if (fresh) {
        if (isRefresh) {
          setRefreshing(true);
          try {
            const result = await fetchAlerts(limit);
            if (mountedRef.current) {
              setAlerts(result.alerts);
              setMeta(result.meta);
            }
          } catch { /* silent */ }
          if (mountedRef.current) setRefreshing(false);
        }
        return;
      }

      if (cached) {
        setAlerts(cached.alerts);
        setMeta(cached.meta);
        setLoading(false);
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await fetchAlerts(limit);
        if (mountedRef.current) {
          setAlerts(result.alerts);
          setMeta(result.meta);
          setError(null);
        }
      } catch (err: unknown) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : "Failed to fetch alerts");
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [limit, key, enabled]
  );

  useEffect(() => {
    mountedRef.current = true;
    doFetch(false);

    const interval = setInterval(() => doFetch(true), CACHE_TTL);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [doFetch]);

  return { alerts, meta, loading, refreshing, error, refetch: () => doFetch(false) };
}