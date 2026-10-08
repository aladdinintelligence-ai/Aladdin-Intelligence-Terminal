"use client";
import {use,useState} from "react";
import {useRouter} from "next/navigation";
import {ExternalLink,Globe,Twitter,LoaderCircle} from "lucide-react";
import {useTokenInfo} from "@/app/hooks/useTokenInfo";
import {useTokenChart} from "@/app/hooks/useTokenChart";
import {Skeleton} from "@/app/components/ui/Skeleton";
import {IfaNow} from "@/app/components/ifa/IfaNow";
import {TerminalInvestigation} from "@/app/components/token/TerminalInvestigation";
import {Badge} from "@/app/components/ui/Badge";
import {WatchlistStar} from "@/app/components/token/WatchlistStar";
import {money,pct} from "@/app/utils/format";
import "@/app/components/ui/skeleton.css";

const INTERVAL_MAP: Record<string, number> = { "1m": 1, "5m": 5, "15m": 15, "1h": 60 };

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

// Wrapper carries its own responsive height instead of `height: 100%` on the
// iframe. Percentage heights only resolve if every ancestor up the chain
// (.terminalGrid, .chartPanel.traderChart, etc.) has an explicit height —
// if any of them is auto-sized, 100% collapses toward the content's natural
// minimum, which is what was making the embed render tiny. clamp() keeps it
// from getting cramped on mobile or absurdly tall on large desktop screens.
function DexScreenerChart({ pairAddress, chain }: { pairAddress: string; chain: string }) {
  const src = `https://dexscreener.com/${chain}/${pairAddress}?embed=1&theme=dark&trades=0&info=0`;
  return (
    <div
      className="dexChartWrap"
      style={{
        position: "relative",
        width: "100%",
        height: "clamp(360px, 62vh, 720px)",
      }}
    >
      <iframe src={src}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", background: "var(--bg)" }}
        title="DexScreener Chart"
        allow="clipboard-write" />
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
  const [chartTf] = useState("5m");
  useTokenChart(mint, INTERVAL_MAP[chartTf], 60);

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

  {token.priceChange24h != null && (
    <em
      style={{
        color: token.priceChange24h >= 0 ? "green" : "red",
        fontWeight: "bold",
        "fontSize": "12px",
      }}
    >
      {pct(token.priceChange24h)}
    </em>
  )}
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
            <b>{token.priceUsd != null ? `$${token.priceUsd < 0.000001 ? token.priceUsd.toFixed(10) : token.priceUsd < 0.01 ? token.priceUsd.toFixed(8) : token.priceUsd.toFixed(6)}` : "—"}</b>
          </div>
        </div>
        <div style={{display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap"}}>
          <WatchlistStar
            token={{
              mint,
              symbol: token.symbol,
              name: token.name,
              imageUrl: token.imageUrl,
              priceUsd: token.priceUsd,
              marketCapUsd: token.marketCapUsd,
              priceChange24h: token.priceChange24h,
              volume24h: token.volume24h,
            }}
          />
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
        {/* <LiveTokenChart candles={candles} loading={chartLoading} error={chartError} tf={chartTf} onTfChange={setChartTf} /> */}
        <DexScreenerChart pairAddress={mint} chain={"solana"} />
        {/* <IfaNow /> */}
      </div>
      <TerminalInvestigation mint={mint} symbol={token.symbol} initialView={view} />
    </>
  );
}