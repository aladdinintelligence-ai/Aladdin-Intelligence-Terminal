"use client";
import Link from "next/link";
import { Bolt, Sparkles } from "lucide-react";
import type { LaunchToken } from "@/app/types/launches";
import {
  ageLabel,
  countCompact,
  moneyCompact,
  volumeChange,
  volumeWindow,
} from "@/app/utils/launches";
import { SyntheticTokenImage } from "@/app/components/launches/SyntheticTokenImage";

export function LaunchFeedRow({
  token,
  onBuy,
}: {
  token: LaunchToken;
  onBuy: (token: LaunchToken) => void;
}) {
  const change = volumeChange(token);
  const migrated = token.lifecycle === "migrated";
  const fresh = token.ageMinutes <= 15;
  return (
    <article className={`launchFeedRow lifecycle-${token.lifecycle}`}>
      <Link
        className="launchFeedImage"
        href={`/live/${token.mint}`}
        aria-label={`Open ${token.symbol} in Terminal`}
      >
        {token.imageUrl ? (
          <img src={token.imageUrl} alt={token.symbol} className="launchFeedImageEl" />
        ) : (
          <SyntheticTokenImage
            id={token.id}
            symbol={token.symbol}
            color={token.color}
            lifecycle={token.lifecycle}
            variant="feed"
          />
        )}
      </Link>
      <div className="launchFeedBody">
        <header className="launchFeedIdentity">
          <Link href={`/live/${token.mint}`}>${token.symbol}</Link>
          <span className={fresh ? "isFresh" : ""}>
            {migrated
              ? `Migrated ${ageLabel(token.migratedMinutesAgo ?? 0)}`
              : ageLabel(token.ageMinutes)}
          </span>
        </header>
        <div className="launchFeedName">{token.name}</div>
        <div className="launchFeedMetrics">
          <FeedMetric label="MC" value={moneyCompact(token.marketCap)} />
          <FeedMetric label="LIQ" value={moneyCompact(token.liquidity)} />
          <span>
            <small>VOL</small>
            <b className="launchLiveValue">{moneyCompact(token.volume)}</b>
            <em>· {volumeWindow(token)}</em>
            {change !== null ? (
              <i className={change >= 0 ? "volumeUp" : "volumeDown"}>
                {change >= 0 ? "â†‘" : "â†“"}
                {Math.abs(change)}%
              </i>
            ) : null}
          </span>
        </div>
        <div className="launchFeedBehaviour">
          <div aria-label="Participant composition">
            <Behaviour
              code="MS"
              count={token.participants.migrationSpecialists}
            />
            <Behaviour code="FW" count={token.participants.freshWallets} />
            <Behaviour code="SC" count={token.participants.scalpers} />
            <Behaviour code="UN" count={token.participants.unknown} />
          </div>
          <button
            type="button"
            onClick={() => onBuy(token)}
            aria-label={`Buy ${token.symbol}`}
          >
            <Bolt size={12} />
            Buy
          </button>
        </div>
        <div className="launchFeedLifecycle">
          {migrated ? (
            <span>
              Holders{" "}
              <b className="launchLiveValue">
                {token.holders === null ? "â€”" : countCompact(token.holders)}
              </b>
              <i>·</i> TX{" "}
              <b className="launchLiveValue">
                {token.transactions === null
                  ? "â€”"
                  : countCompact(token.transactions)}
              </b>
            </span>
          ) : (
            <span className="launchFeedBond">
              <b>Bond {token.bondingProgress}%</b>
              <i>
                <em style={{ width: `${token.bondingProgress ?? 0}%` }} />
              </i>
            </span>
          )}
          <Link
            href={`/ask-aladdin?context=token:${encodeURIComponent(token.id)}&label=${encodeURIComponent(`$${token.symbol}`)}&mint=${encodeURIComponent(token.mint)}&autorun=token`}
          >
            <Sparkles size={12} />
            Ask Aladdin
          </Link>
        </div>
      </div>
    </article>
  );
}

function FeedMetric({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <small>{label}</small>
      <b className="launchLiveValue">{value}</b>
    </span>
  );
}
function Behaviour({
  code,
  count,
}: {
  code: "MS" | "FW" | "SC" | "UN";
  count: number;
}) {
  return (
    <span className={`behaviour-${code.toLowerCase()}`}>
      <b>{code}</b>
      {count}
    </span>
  );
}
