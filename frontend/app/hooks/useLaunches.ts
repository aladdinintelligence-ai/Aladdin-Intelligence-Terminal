'use client';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { LaunchToken } from '@/app/types/launches';
import { apiFetch } from '@/app/lib/api';

export type LaunchTab = 'new' | 'almost-bonded' | 'migrated' | 'trending';

export const LAUNCH_TABS: LaunchTab[] = ['new', 'almost-bonded', 'migrated', 'trending'];
export const CACHE_TTL = 120_000;
export const STORAGE_KEY = 'aladdin-launches-data-v2';

export function tabParam(tab: string): string {
  return tab.toLowerCase().replace(/\s+/g, '-');
}

interface TabState {
  status: 'idle' | 'fetching' | 'ok' | 'error';
  tokens: LaunchToken[];
  fetchedAt: number | null;
  error: string | null;
}

function initialTabState(): TabState {
  return { status: 'idle', tokens: [], fetchedAt: null, error: null };
}

// Module-level store shared by every useLaunches instance so any tab's data is
// available before the user clicks it. getSnapshot returns a fresh Map on each
// patch so useSyncExternalStore notices the change.
let cache = new Map<LaunchTab, TabState>();
const inflight = new Map<LaunchTab, Promise<void>>();
const listeners = new Set<() => void>();
const EMPTY_MAP = new Map<LaunchTab, TabState>();
let hydrated = false;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Map<LaunchTab, TabState> {
  ensureHydrated();
  return cache;
}

function getServerSnapshot(): Map<LaunchTab, TabState> {
  return EMPTY_MAP;
}

function patch(tab: LaunchTab, partial: Partial<TabState>) {
  const next = new Map(cache);
  next.set(tab, { ...(cache.get(tab) ?? initialTabState()), ...partial });
  cache = next;
  writePersisted();
  emit();
}

function persistable(): Record<string, Pick<TabState, 'status' | 'tokens' | 'fetchedAt'>> {
  const out: Record<string, Pick<TabState, 'status' | 'tokens' | 'fetchedAt'>> = {};
  for (const [tab, state] of cache) {
    if (state.status === 'ok' || state.tokens.length > 0) {
      out[tab] = { status: 'ok', tokens: state.tokens, fetchedAt: state.fetchedAt };
    }
  }
  return out;
}

function writePersisted() {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persistable()));
    }
  } catch {
    /* storage unavailable: keep memory-only */
  }
}

function ensureHydrated() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, Partial<TabState>>;
    let dirty = false;
    for (const tab of LAUNCH_TABS) {
      const saved = parsed[tab];
      if (!saved || !Array.isArray(saved.tokens)) continue;
      const fetchedAt = typeof saved.fetchedAt === 'number' ? Math.max(saved.fetchedAt, 0) : null;
      cache = new Map(cache).set(tab, { status: 'ok', tokens: saved.tokens as LaunchToken[], fetchedAt, error: null });
      dirty = true;
    }
    if (dirty) {
      // Don't emit during render (getSnapshot may be the first call that
      // hydrates); the returning snapshot already carries the persisted data.
      queueMicrotask(emit);
    }
  } catch {
    /* corrupt storage: ignore and refetch everything */
  }
}

async function fetchTab(tab: LaunchTab): Promise<void> {
  const running = inflight.get(tab);
  if (running) return running;

  const prior = cache.get(tab) ?? initialTabState();
  const hasData = prior.tokens.length > 0;
  patch(tab, hasData ? { status: 'fetching', error: null } : { status: 'fetching' });

  const promise = (async () => {
    try {
      const res = await apiFetch<{ data: LaunchToken[]; meta: unknown }>(
        `/api/launches?tab=${tabParam(tab)}&limit=50`
      );
      patch(tab, { status: 'ok', tokens: res.data || [], fetchedAt: Date.now(), error: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch launches';
      const sticky = cache.get(tab);
      const keep = sticky && sticky.tokens.length > 0;
      patch(tab, keep
        ? { status: 'ok', error: null }
        : { status: 'error', tokens: [], error: message });
    } finally {
      inflight.delete(tab);
    }
  })();

  inflight.set(tab, promise);
  return promise;
}

function isStale(state: TabState | undefined): boolean {
  if (!state || state.status !== 'ok' || state.tokens.length === 0) return false;
  return state.fetchedAt === null || Date.now() - state.fetchedAt > CACHE_TTL;
}

interface UseLaunchesResult {
  tokens: LaunchToken[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: () => void;
}

export function useLaunches(tab: string): UseLaunchesResult {
  const key = tabParam(tab) as LaunchTab;
  const cacheSnapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const state = cacheSnapshot.get(key) ?? initialTabState();

  const hasData = state.tokens.length > 0;
  const loading = !hasData && state.status !== 'error';
  const refreshing = hasData && state.status === 'fetching';
  const error = state.status === 'error' && !hasData ? state.error : null;

  // Warm every tab on mount so switching tabs is instant — the "click, then
  // wait for a spinner" pattern is what this removes. Tabs already fresh from
  // the session cache are left alone (no wasted queries on every visit).
  useEffect(() => {
    for (const t of LAUNCH_TABS) {
      const st = cache.get(t);
      if (!st || st.tokens.length === 0 || isStale(st)) void fetchTab(t);
    }
  }, []);

  // Keep the active tab fresh: refresh in the background once its data ages
  // past CACHE_TTL (paint the cached rows; replace them silently).
  useEffect(() => {
    if (isStale(cache.get(key))) void fetchTab(key);
  }, [key]);

  useEffect(() => {
    const id = setInterval(() => {
      for (const t of LAUNCH_TABS) {
        if (isStale(cache.get(t))) void fetchTab(t);
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  return {
    tokens: state.tokens,
    loading,
    refreshing,
    error,
    refetch: useCallback(() => {
      void fetchTab(key);
    }, [key]),
  };
}

export interface LaunchStats {
  tracked: number;
  almostBonded: number;
  migrated: number;
}

// Counts are derived from the shared cache of every tab, so the header boxes
// reflect all lifecycles on load (and whenever any tab's data changes) instead
// of only the currently selected tab.
export function useLaunchStats(): LaunchStats {
  const cacheSnapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const almostBonded = cacheSnapshot.get('almost-bonded')?.tokens.length ?? 0;
  const migrated = cacheSnapshot.get('migrated')?.tokens.length ?? 0;
  const tracked = (cacheSnapshot.get('new')?.tokens.length ?? 0) + almostBonded + migrated;
  return { tracked, almostBonded, migrated };
}