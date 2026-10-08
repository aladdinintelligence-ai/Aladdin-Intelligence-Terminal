'use client';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export interface Trade {
  time: string;
  side: "BUY" | "SELL";
  amount: number;
  priceUsd: number;
  signature: string;
  /** Trader address. The backend already returns this for the trades tab. */
  wallet: string;
  /** Aladdin's per-wallet behaviour for this token snapshot (Creator, Scalper,
   * Cluster Wallet, Fresh Wallet, ...) or a direction (Buyer/Seller/Mixed). */
  behaviour?: string;
}

export interface Participant {
  wallet: string;
  short: string;
  trades: number;
  buys: number;
  sells: number;
  totalVolumeUsd: number;
  firstTrade: string;
  lastTrade: string;
  behaviour: string;
}

export interface Holder {
  rank: number;
  wallet: string;
  short: string;
  balance: number;
  supplyPct: string;
}

export interface FirstBuyer {
  rank: number;
  wallet: string;
  short: string;
  firstBuyTime: string;
  amountUsd: number;
}

export interface TokenStats {
  trades24h: number;
  volume24h: number;
  buys24h: number;
  sells24h: number;
  trades1h: number;
  volume1h: number;
  holders: number;
  top10Pct: number;
}

type TabData = Trade[] | Participant[] | Holder[] | FirstBuyer[] | TokenStats | null;

export function useTokenDetail(mint: string | null, tab: string | null, limit = 50, refetchInterval = 0) {
  const [data, setData] = useState<TabData>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // A null tab means the view fetches its own data (e.g. LiveTradesLog).
    if (!mint || !tab) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    const tabParam = tab.toLowerCase().replace(/\s+/g, '-');
    fetch(`${API_URL}/api/token-detail/${mint}?tab=${tabParam}&limit=${limit}`)
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Request failed with status ${res.status}`);
        }
        return res.json();
      })
      .then(json => {
        if (!cancelled) { setData(json.data); setError(null); }
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [mint, tab, limit]);

  // Optional background refresh so live views pick up new on-chain rows.
  // Deliberately does not touch `loading`/`error`, otherwise every poll would
  // flip the table back to its skeleton and defeat the point.
  useEffect(() => {
    if (!mint || !tab || refetchInterval <= 0) return;

    let cancelled = false;
    const controller = new AbortController();
    const tick = async () => {
      const tabParam = tab.toLowerCase().replace(/\s+/g, '-');
      try {
        const res = await fetch(
          `${API_URL}/api/token-detail/${mint}?tab=${tabParam}&limit=${limit}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json.data);
      } catch {
        // Transient poll failure: keep showing the last good snapshot.
      }
    };

    const timer = setInterval(() => { void tick(); }, refetchInterval);
    return () => { cancelled = true; controller.abort(); clearInterval(timer); };
  }, [mint, tab, limit, refetchInterval]);

  return { data, loading, error };
}
