"use client";
import { useEffect, useState } from "react";
import { isStale, timeAgo } from "@/app/utils/time";

export default function MetaLine({
  label,
  count,
  sub,
  fetchedAt,
  stale,
  staleAfterMs = 120_000,
}: {
  label: string;
  count?: number | null;
  sub?: string | null;
  fetchedAt?: string | null;
  stale?: boolean;
  staleAfterMs?: number;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const isStaleNow = stale === true || isStale(fetchedAt, staleAfterMs, nowMs);

  return (
    <div className="ogMetaLine" data-stale={isStaleNow ? "true" : "false"}>
      <span>
        {isStaleNow ? <i data-stale-dot aria-hidden="true" /> : null}
        {count != null ? `${count} ${label}` : label}
        {sub ? ` · ${sub}` : ""}
      </span>
      <span>data details above · updated {timeAgo(fetchedAt, nowMs)}</span>
    </div>
  );
}