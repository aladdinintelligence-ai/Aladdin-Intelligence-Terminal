"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoaderCircle, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/app/hooks/useAuth";
import { useWatchlist } from "@/app/hooks/useWatchlist";
import { EntryModal } from "@/app/components/landing/EntryModal";
import { WatchlistStar } from "@/app/components/token/WatchlistStar";
import { money, pct } from "@/app/utils/format";

function priceLabel(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v < 0.000001) return `$${v.toFixed(10)}`;
  if (v < 0.01) return `$${v.toFixed(8)}`;
  return `$${v.toFixed(6)}`;
}

export function WatchlistExperience() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { items, loading, error, refresh } = useWatchlist();
  const [entryOpen, setEntryOpen] = useState(false);

  if (authLoading || loading) {
    return (
      <div className="launchEmpty">
        <LoaderCircle className="spin" size={24} style={{ opacity: 0.5 }} />
        <b>Loading your watchlist…</b>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <div className="launchEmpty">
          <b>Sign in to use your watchlist</b>
          <span>Saved tokens sync to your account and follow you across devices.</span>
          <button onClick={() => setEntryOpen(true)}>Sign In</button>
        </div>
        <EntryModal
          open={entryOpen}
          onClose={() => setEntryOpen(false)}
          onAuth={() => setEntryOpen(false)}
        />
      </>
    );
  }

  if (error && !items.length) {
    return (
      <div className="launchEmpty">
        <b>Could not load your watchlist</b>
        <span>{error}</span>
        <button onClick={() => refresh()}>Retry</button>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="launchEmpty">
        <b>Your watchlist is empty</b>
        <span>Open any live token and tap the star to save it here.</span>
        <button onClick={() => router.push("/launches")}>Browse launches</button>
      </div>
    );
  }

  // Newest first: the API returns items in the order they were added.
  const ordered = [...items].reverse();

  return (
    <>
      <div className="pageTitle">
        <div>
          <span className="eyebrow">TRADING</span>
          <h1>Watchlist</h1>
          <p>Tokens you saved from the live terminal—price, market cap and flow at a glance.</p>
        </div>
        <span className="watchCount">{items.length} / 100</span>
      </div>

      <div className="watchlistGrid">
        {ordered.map((item) => (
          <article className="watchCard" key={item.mint}>
            <div className="watchCardTop">
              <Link href={`/live/${item.mint}`} className="watchCardId">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt={item.symbol || "token"} className="coin" />
                ) : (
                  <span className="coin" style={{ background: "#9b7cff" }}>
                    {(item.symbol || "?")[0]}
                  </span>
                )}
                <div>
                  <b>${item.symbol || item.mint.slice(0, 4).toUpperCase()}</b>
                  <small>{item.name || "Unknown token"}</small>
                </div>
              </Link>
              <WatchlistStar token={item} />
            </div>

            <div className="watchCardStats">
              <div>
                <small>PRICE</small>
                <b>{priceLabel(item.priceUsd)}</b>
              </div>
              <div>
                <small>24H</small>
                <b className={item.priceChange24h == null ? "" : item.priceChange24h >= 0 ? "up" : "down"}>
                  {pct(item.priceChange24h)}
                </b>
              </div>
              <div>
                <small>MARKET CAP</small>
                <b>{money(item.marketCapUsd)}</b>
              </div>
              <div>
                <small>24H VOLUME</small>
                <b>{money(item.volume24h)}</b>
              </div>
            </div>

            <div className="watchCardFoot">
              {item.live === false ? (
                <span className="watchStale">cached</span>
              ) : (
                <span>{item.dexId ? item.dexId.toUpperCase() : "\u00b7"}</span>
              )}
              <Link href={`/live/${item.mint}`}>
                Open terminal <ArrowUpRight size={12} />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
