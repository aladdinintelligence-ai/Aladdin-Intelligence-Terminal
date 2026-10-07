export function FreshnessLine({ state, period, coverage }: { state: "fresh" | "stale" | "unknown"; period: string; coverage?: string }) {
  const text =
    state === "fresh"
      ? `Data current as of ${period}`
      : state === "stale"
        ? `No current data for ${period} — showing last confirmed evidence`
        : `Data availability for ${period} is unknown`;
  return <p className="answerPeriod" data-state={state}>{text}{coverage ? ` · ${coverage}` : ""}</p>;
}