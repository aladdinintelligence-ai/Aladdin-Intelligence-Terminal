'use client';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export interface Trade {
  time: string;
  side: "BUY" | "SELL";
  amount: number;
  priceUsd: number;
  signature: string;
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

export function useTokenDetail(mint: string | null, tab: string, limit = 50) {
  const [data, setData] = useState<TabData>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mint) { setLoading(false); return; }

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

  return { data, loading, error };
}
