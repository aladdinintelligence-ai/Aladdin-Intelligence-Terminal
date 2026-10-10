'use client';
import { useEffect, useState } from 'react';

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export function useTokenChart(mint: string | null, intervalMinutes = 5, limit = 100) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mint) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_URL}/api/token-chart/${mint}?interval=${intervalMinutes}&limit=${limit}`)
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Request failed with status ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        if (!cancelled) {
          setCandles(data.data || []);
          setError(null);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load chart');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [mint, intervalMinutes, limit]);

  return { candles, loading, error };
}
