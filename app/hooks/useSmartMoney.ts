'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/app/lib/api';

export interface SmartWallet {
  id: string;
  address: string;
  color: string;
  behaviour: string;
  secondary: string;
  realizedPnl: number;
  winRate: number;
  sampleTokens: number;
  computableTokens: number;
  entryStage: { label: string; token: string };
  openUsd: number;
  openCount: number;
  holdingPct: number;
  repeatable: boolean;
  topTokens: { symbol: string; realized: number; remainingPct: number; openUsd: number }[];
}

export interface SmartMoneyMeta {
  count: number;
  source: string;
  fetchedAt: string;
  coverage: string;
  askTarget: string;
}

interface CacheEntry {
  wallets: SmartWallet[];
  meta: SmartMoneyMeta | null;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<{ wallets: SmartWallet[]; meta: SmartMoneyMeta | null }>>();
const CACHE_TTL = 120_000;

async function fetchSmartMoney(limit = 20): Promise<{ wallets: SmartWallet[]; meta: SmartMoneyMeta | null }> {
  const key = `smart-money:${limit}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = apiFetch<{ data: SmartWallet[]; meta: SmartMoneyMeta | null }>(
    `/api/smart-money?limit=${limit}`
  ).then(r => ({ wallets: r.data || [], meta: r.meta || null }));

  inflight.set(key, promise);
  try {
    const result = await promise;
    cache.set(key, { wallets: result.wallets, meta: result.meta, timestamp: Date.now() });
    return result;
  } finally {
    inflight.delete(key);
  }
}

interface UseSmartMoneyResult {
  wallets: SmartWallet[];
  meta: SmartMoneyMeta | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSmartMoney(limit = 20, enabled = true): UseSmartMoneyResult {
  const key = `smart-money:${limit}`;
  const [wallets, setWallets] = useState<SmartWallet[]>(() => cache.get(key)?.wallets ?? []);
  const [meta, setMeta] = useState<SmartMoneyMeta | null>(() => cache.get(key)?.meta ?? null);
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
          const result = await fetchSmartMoney(limit);
          if (mountedRef.current) {
            setWallets(result.wallets);
            setMeta(result.meta);
          }
        } catch { /* silent */ }
        if (mountedRef.current) setRefreshing(false);
      }
      return;
    }

    if (cached) {
      setWallets(cached.wallets);
      setMeta(cached.meta);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const result = await fetchSmartMoney(limit);
      if (mountedRef.current) {
        setWallets(result.wallets);
        setMeta(result.meta);
        setError(null);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch proven wallets');
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

  return { wallets, meta, loading, refreshing, error, refetch: () => doFetch(false) };
}