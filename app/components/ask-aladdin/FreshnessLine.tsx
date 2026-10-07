import { timeAgo } from "@/app/utils/time";

export function FreshnessLine({ state, period, coverage, stale, updatedAt }: { state: "fresh" | "stale" | "unknown"; period: string; coverage?: string; stale?: boolean; updatedAt?: string | null }) {
  const confirmed = updatedAt ? timeAgo(updatedAt) : "";
  const isStale = stale === true || (stale !== false && state === "stale");
  const text =
    state === "unknown"
      ? `Data availability for ${period} is unknown`
      : isStale
        ? updatedAt
          ? `Data is stale — last confirmed ${confirmed} ago`
          : `No current data for ${period} — showing last confirmed evidence`
        : `Data current as of ${period}` + (confirmed ? ` · confirmed ${confirmed} ago` : "");
  return <p className="answerPeriod" data-state={isStale ? "stale" : state}>{text}{coverage ? ` · ${coverage}` : ""}</p>;
}