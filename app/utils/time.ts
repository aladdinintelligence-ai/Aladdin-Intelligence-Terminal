export function timeAgo(iso?: string | null, nowMs: number = Date.now()): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function isStale(fetchedAt: string | null | undefined, maxAgeMs: number, nowMs: number = Date.now()): boolean {
  if (!fetchedAt) return true;
  const t = new Date(fetchedAt).getTime();
  return !Number.isFinite(t) || nowMs - t >= maxAgeMs;
}