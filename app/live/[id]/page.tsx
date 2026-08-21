"use client";
import {use} from "react";
import {useRouter} from "next/navigation";
import {ExternalLink,Globe,Twitter,LoaderCircle} from "lucide-react";
import {useTokenInfo} from "@/app/hooks/useTokenInfo";
import {Skeleton} from "@/app/components/ui/Skeleton";
import {TokenChart} from "@/app/components/token/TokenChart";
import {IfaNow} from "@/app/components/ifa/IfaNow";
import {TerminalInvestigation} from "@/app/components/token/TerminalInvestigation";
import {Badge} from "@/app/components/ui/Badge";
import {money,pct} from "@/app/utils/format";
import type {Token} from "@/app/types";
import "@/app/components/ui/skeleton.css";

function ageLabel(ms: number | null): string {
  if (!ms) return "Unknown";
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

function shortMint(mint: string): string {
  return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}

function HeroSkeleton() {
  return (
    <div className="tokenHero">
      <Skeleton className="skeleton-circle" count={1} />
      <div className="tokenName">
        <Skeleton className="skeleton-text-sm" count={1} />
        <Skeleton className="skeleton-text-lg" count={1} />
        <Skeleton className="skeleton-text-sm" count={1} />
      </div>
      <div className="heroMetrics">
        {Array.from({length: 5}, (_, i) => (
          <div key={i} style={{display: "grid", gap: 4}}>
            <Skeleton className="skeleton-text-sm" count={1} />
            <Skeleton className="skeleton-text" count={1} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Live({params, searchParams}: {
  params: Promise<{id: string}>;
  searchParams: Promise<{view?: string}>;
}) {
  const {id: mint} = use(params);
  const {view} = use(searchParams);
  const router = useRouter();
  const {token, loading, error} = useTokenInfo(mint);

  const handleCopy = () => {
    navigator.clipboard.writeText(mint);
  };

  if (loading) {
    return (
      <>
        <HeroSkeleton />
        <div className="terminalGrid">
          <section className="chartPanel traderChart">
            <div style={{padding: 40, display: "grid", placeItems: "center"}}>
              <LoaderCircle className="spin" size={24} style={{opacity: 0.4}} />
            </div>
          </section>
          <IfaNow />
        </div>
        <div className="investigate" style={{padding: 40, display: "grid", placeItems: "center"}}>
          <LoaderCircle className="spin" size={24} style={{opacity: 0.4}} />
        </div>
      </>
    );
  }

  if (error || !token) {
    return (
      <div className="launchEmpty">
        <b>Token not found</b>
        <span>{error || "Could not load token data for this mint address."}</span>
        <button onClick={() => router.push("/launches")}>Back to Launches</button>
      </div>
    );
  }

  const mockToken: Token = {
    id: mint.slice(0, 8),
    mint,
    symbol: token.symbol,
    name: token.name,
    age: ageLabel(token.pairCreatedAt),
    mc: token.marketCapUsd ?? 0,
    liquidity: token.liquidityUsd ?? 0,
    volume: token.volume24h ?? 0,
    buys: token.txns24h?.buys ?? 0,
    sells: token.txns24h?.sells ?? 0,
    buyers: (token.txns24h?.buys ?? 0),
    migration: 100,
    holders: 0,
    creator: 0,
    top10: 0,
    profitable: 0,
    retention: 0,
    formation: "DISCOVERY",
    change: token.priceChange24h ?? 0,
    color: "#9b7cff",
  };

  return (
    <>
      <div className="tokenHero">
        {token.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={token.imageUrl} alt={token.symbol} className="coin large" style={{objectFit: "cover"}} />
        ) : (
          <span className="coin large" style={{background: "#9b7cff"}}>
            {token.symbol[0]}
          </span>
        )}
        <div className="tokenName">
          <span>LIVE TERMINAL</span>
          <h1>
            ${token.symbol} <small>{token.name}</small>
          </h1>
          <p>
            {shortMint(mint)} <button onClick={handleCopy} type="button">Copy</button> {"\u00b7"} {ageLabel(token.pairCreatedAt)} old
          </p>
        </div>
        <div className="heroMetrics">
          <div>
            <small>MARKET CAP</small>
            <b>{token.marketCapUsd != null ? money(token.marketCapUsd) : "—"}</b>
            {token.priceChange24h != null && <em>{pct(token.priceChange24h)}</em>}
          </div>
          <div>
            <small>LIQUIDITY</small>
            <b>{token.liquidityUsd != null ? money(token.liquidityUsd) : "—"}</b>
          </div>
          <div>
            <small>24H VOLUME</small>
            <b>{token.volume24h != null ? money(token.volume24h) : "—"}</b>
          </div>
          <div>
            <small>1H VOLUME</small>
            <b>{token.volume1h != null ? money(token.volume1h) : "—"}</b>
          </div>
          <div>
            <small>PRICE</small>
            <b>{token.priceUsd != null ? `$${token.priceUsd < 0.01 ? token.priceUsd.toExponential(2) : token.priceUsd.toFixed(6)}` : "—"}</b>
          </div>
        </div>
        <div style={{display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap"}}>
          {token.dexId && <Badge>{token.dexId.toUpperCase()}</Badge>}
          {token.url && (
            <a href={token.url} target="_blank" rel="noreferrer" className="badge" style={{textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4}}>
              View on DexScreener <ExternalLink size={11}/>
            </a>
          )}
          {token.website && (
            <a href={token.website} target="_blank" rel="noreferrer" className="badge" style={{textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4}}>
              <Globe size={11}/> Website
            </a>
          )}
          {token.socials.filter(s => s.type === "twitter").map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noreferrer" className="badge" style={{textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4}}>
              <Twitter size={11}/> Twitter
            </a>
          ))}
        </div>
      </div>
      <div className="terminalGrid">
        <TokenChart tokenId={mint.slice(0, 8)} />
        <IfaNow />
      </div>
      <TerminalInvestigation token={mockToken} initialView={view} />
    </>
  );
}
