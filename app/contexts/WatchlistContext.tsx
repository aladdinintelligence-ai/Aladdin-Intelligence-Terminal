"use client";
import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/app/lib/api";
import { useAuth } from "@/app/hooks/useAuth";

export interface WatchlistItem {
  mint: string;
  symbol?: string;
  name?: string;
  imageUrl?: string;
  priceUsd?: number | null;
  marketCapUsd?: number | null;
  liquidityUsd?: number | null;
  volume24h?: number | null;
  volume1h?: number | null;
  priceChange24h?: number | null;
  priceChange1h?: number | null;
  dexId?: string;
  pairAddress?: string;
  url?: string;
  live?: boolean;
  createdAt?: string;
}

export interface WatchlistAddToken {
  mint: string;
  symbol?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  priceUsd?: number | null;
  marketCapUsd?: number | null;
  priceChange24h?: number | null;
  volume24h?: number | null;
}

export interface WatchlistContextValue {
  items: WatchlistItem[];
  loading: boolean;
  error: string | null;
  has: (mint: string) => boolean;
  add: (token: WatchlistAddToken) => Promise<void>;
  remove: (mint: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export const WatchlistContext = createContext<WatchlistContextValue | null>(null);

// One shared watchlist per session: the live-page star, the watchlist page
// and every card all read this single fetch/update cycle.
export function WatchlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<{ items: WatchlistItem[] }>("/api/watchlist");
      setItems(data.items || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load watchlist");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user) {
        if (!cancelled) {
          setItems([]);
          setError(null);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setLoading(true);
      try {
        const data = await apiFetch<{ items: WatchlistItem[] }>("/api/watchlist");
        if (!cancelled) {
          setItems(data.items || []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load watchlist");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const add = useCallback(async (token: WatchlistAddToken) => {
    const data = await apiFetch<{ added: boolean; item: WatchlistItem }>(
      `/api/watchlist/${encodeURIComponent(token.mint)}`,
      { method: "POST", body: JSON.stringify(token) },
    );
    setItems((prev) =>
      prev.some((i) => i.mint === token.mint) ? prev : [data.item, ...prev],
    );
  }, []);

  const remove = useCallback(async (mint: string) => {
    await apiFetch<{ removed: boolean }>(
      `/api/watchlist/${encodeURIComponent(mint)}`,
      { method: "DELETE" },
    );
    setItems((prev) => prev.filter((i) => i.mint !== mint));
  }, []);

  const has = useCallback(
    (mint: string) => items.some((i) => i.mint === mint),
    [items],
  );

  return (
    <WatchlistContext.Provider value={{ items, loading, error, has, add, remove, refresh }}>
      {children}
    </WatchlistContext.Provider>
  );
}
