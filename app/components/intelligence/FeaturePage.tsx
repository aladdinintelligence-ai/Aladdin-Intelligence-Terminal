"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, CheckCircle2, ChevronRight, Filter } from "lucide-react";
import { tokens } from "@/app/data/tokens";
import { wallets } from "@/app/data/wallets";
import { money, pct } from "@/app/utils/format";
import { Badge } from "@/app/components/ui/Badge";
import { behaviourColor } from "@/app/utils/behaviour";
import { useMovers, type MoverToken } from "@/app/hooks/useMovers";

const copy: Record<string, { eyebrow: string; title: string; desc: string; question: string }> = {
  "movers": { eyebrow: "MARKET", title: "Movers + Why", desc: "Price movement explained through participation and ownership changes.", question: "What moved, and what changed underneath?" },
  "narratives": { eyebrow: "MARKET", title: "Narratives", desc: "Specific meme metas ranked by participation quality—not social noise alone.", question: "Where is profitable attention rotating?" },
  "formation": { eyebrow: "INTELLIGENCE", title: "Market Formation", desc: "On-chain participation states and the evidence behind each transition.", question: "Is this formation strengthening or failing?" },
  "insiders": { eyebrow: "INTELLIGENCE", title: "Insider / Creator Activity", desc: "Identifiable creator, funding and early-wallet relationships without unsupported claims.", question: "Is linked supply accumulating or distributing?" },
  "smart-money": { eyebrow: "INTELLIGENCE", title: "Smart / Profitable Money", desc: "Wallet strength explained by realised performance, repeatability and entry timing.", question: "Where are proven wallets positioning now?" },
  "clusters": { eyebrow: "INTELLIGENCE", title: "Coordinated Wallets", desc: "Repeated group behaviour surfaced as evidence, not accusation.", question: "Which wallets repeatedly appear together?" },
  "historical": { eyebrow: "INVESTIGATE", title: "Historical Match", desc: "Compare live formations with observed outcomes and explicit differences.", question: "How did similar formations resolve?" },
  "watchlist": { eyebrow: "TRADING", title: "Behaviour Watchlist", desc: "Track formation, flow, ownership and Aladdin changes—not price alone.", question: "What changed since the last check?" },
  "alerts": { eyebrow: "TRADING", title: "Alerts", desc: "High-signal behavioural events linked directly to the evidence.", question: "Which change requires a decision now?" },
  "og": { eyebrow: "MARKET", title: "Established / OG", desc: "Future-facing market structure workspace for established meme assets.", question: "How does on-chain positioning relate to mature market structure?" },
};

export function FeaturePage({ kind }: { kind: string }) {
  const c = copy[kind];
  const [filter, setFilter] = useState("All");

  return (
    <>
      <div className="pageTitle">
        <div>
          <span className="eyebrow">{c.eyebrow}</span>
          <h1>{c.title}</h1>
          <p>{c.desc}</p>
        </div>
        <button className="primary">Open in Ask Aladdin <ArrowUpRight size={14} /></button>
      </div>
      <div className="decisionQuestion">
        <span>TRADING QUESTION</span>
        <b>{c.question}</b>
        <small>Open Data Details for source and freshness</small>
      </div>
      <div className="toolbar">
        <div className="tabs">
          {["All", "High signal", "New", "Changed"].map(x => (
            <button key={x} onClick={() => setFilter(x)} className={filter === x ? "active" : ""}>{x}</button>
          ))}
        </div>
        <button><Filter size={14} />Refine</button>
      </div>
      {kind === "smart-money" ? <WalletTable /> :
       kind === "narratives" ? <Narratives /> :
       kind === "clusters" ? <Clusters /> :
       kind === "historical" ? <Historical /> :
       kind === "alerts" ? <Alerts /> :
       <EvidenceRows kind={kind} />}
    </>
  );
}

function EvidenceRows({ kind }: { kind: string }) {
  const { tokens: moverTokens, loading, error } = useMovers(20);
  const displayTokens: MoverToken[] = kind === "movers" ? moverTokens : [];

  if (kind === "movers" && loading) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>Loading movers...</span></div></div>;
  }

  if (kind === "movers" && error) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>{error}</span></div></div>;
  }

  if (kind === "movers" && displayTokens.length === 0) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>No movers data available</span></div></div>;
  }

  // For non-movers kinds, fall back to static tokens
  const staticTokens = kind === "movers" ? [] : tokens.slice(0, 4);
  const rows = kind === "movers" ? displayTokens : staticTokens;

  return (
    <div className="evidenceRows">
      {rows.map((t, i) => (
        <Link href={`/live/${t.mint || t.id}`} className="evidenceRow" key={t.mint || t.id}>
          {t.imageUrl ? (
            <img src={t.imageUrl} alt={t.symbol} className="coin" style={{ objectFit: "cover" }} />
          ) : (
            <span className="coin" style={{ background: t.color }}>{t.symbol[0]}</span>
          )}
          <div className="evidenceIdentity">
            <b>${t.symbol}</b>
            <small>{t.name}</small>
          </div>
          <div>
            <small>CURRENT STATE</small>
            <Badge>{t.formation}</Badge>
          </div>
          <div>
            <small>BEHAVIOURAL CHANGE</small>
            <b>{kind === "movers" ? `${t.buyers} buyers` : kind === "insiders" ? (i === 0 ? "Creator cohort −3.2%" : "Linked supply stable") : kind === "formation" ? (i === 0 ? "DISCOVERY → BROAD ACCUMULATION" : "Profitable flow increasing") : `${t.buyers} buyers`}</b>
          </div>
          <div>
            <small>MARKET</small>
            <b>{money(t.mc)} <em className={t.change < 0 ? "negative" : ""}>{pct(t.change)}</em></b>
          </div>
          <div>
            <small>WHY IT MATTERS</small>
            <span>{i === 0 ? "Participation broadening while concentration falls." : i === 1 ? "Migration positioning with repeated wallet overlap." : "Evidence is mixed; inspect before acting."}</span>
          </div>
          <ChevronRight size={16} />
        </Link>
      ))}
    </div>
  );
}

function WalletTable() {
  return (
    <div className="dataTable walletTable">
      <div className="tr head">
        <span>WALLET</span><span>WHY STRONG</span><span>REALIZED PNL</span>
        <span>WIN RATE</span><span>SAMPLE</span><span>ENTRY STAGE</span>
        <span>OPEN POSITION</span><span></span><span></span>
      </div>
      {wallets.map(w => (
        <Link href={`/wallet/${w.id}`} className="tr" key={w.id}>
          <b>{w.short}</b>
          <span><Badge color={behaviourColor[w.behaviour]}>{w.behaviour}</Badge></span>
          <b className="buy">{money(w.pnl)}</b>
          <span>{w.winRate}%</span>
          <span>{w.trades} trades</span>
          <span>{w.entry}</span>
          <span>{w.holding} remains</span>
          <span>Repeatable</span>
          <ChevronRight size={14} />
        </Link>
      ))}
    </div>
  );
}

function Narratives() {
  const [selected, setSelected] = useState<string | null>(null);
  const narratives = [
    ["Animals", "HOT", "$2.4M", 38, 7, "+32%"],
    ["AI meme", "HEATING", "$1.8M", 24, 5, "+28%"],
    ["Solana culture", "HOT", "$3.1M", 41, 9, "+41%"],
    ["Viral event", "COOLING", "$920K", 17, 3, "-8%"],
    ["CTO", "ROTATING OUT", "$610K", 12, 2, "-19%"],
    ["Internet character", "DORMANT", "$184K", 6, 1, "-31%"],
  ] as const;

  return (
    <div className="cardGrid">
      {narratives.map((item, i) => {
        const [name, state, volume, launches, migrated, momentum] = item;
        const open = selected === name;
        const top = tokens[i % tokens.length];
        return (
          <article className="narrativeCard" key={name}>
            <header><span>0{i + 1}</span><Badge color={i < 3 ? "#33d6a6" : "#f6b94a"}>{state}</Badge></header>
            <h2>{name}</h2>
            <div className="narrativeStats">
              <span><small>24H VOLUME</small><b>{volume}</b></span>
              <span><small>NEW LAUNCHES</small><b>{launches}</b></span>
              <span><small>MIGRATED</small><b>{migrated}</b></span>
              <span><small>WALLET FLOW</small><b>{momentum}</b></span>
            </div>
            <p>{i < 3 ? "Profitable participation and migration quality are above today's median." : "Participation momentum is weakening across recent launches."}</p>
            <button type="button" aria-expanded={open} onClick={() => setSelected(current => current === name ? null : name)}>
              {open ? "Close narrative" : "View narrative"} <ArrowUpRight size={13} />
            </button>
            {open ? (
              <div className="narrativeTokenDrivers">
                <small>TOP TOKENS DRIVING THIS NARRATIVE</small>
                {tokens.slice(0, 3).map((token, index) => (
                  <Link href={`/live/${token.id}`} key={token.id}>
                    <span className="coin" style={{ background: token.color }}>{token.symbol[0]}</span>
                    <span><b>${token.symbol}</b><small>{index === 0 ? "Top token" : index === 1 ? "New launch" : "Migrating"}</small></span>
                    <strong>{pct(token.change)}</strong>
                    <ChevronRight />
                  </Link>
                ))}
              </div>
            ) : null}
            <div className="narrativeTopToken">
              <small>TOP TOKEN</small>
              <Link href={`/live/${top.id}`}>${top.symbol} <b>{pct(top.change)}</b></Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Clusters() {
  return (
    <div className="cardGrid">
      {[19, 7, 31, 42].map((n, i) => (
        <article className="clusterCard" key={n}>
          <header><span>{n} wallets</span><Badge color="#8b7cf6">Linked</Badge></header>
          <h2>Cluster {i + 1}</h2>
          <p>Repeated coordinated buying pattern detected across {n} wallets.</p>
          <Link href="/live/bark">View evidence <ChevronRight size={14} /></Link>
        </article>
      ))}
    </div>
  );
}

function Historical() {
  return (
    <div className="historyLayout">
      <section>
        <div className="matchHero">
          <span><small>FORMATION MATCHES</small><b>83</b></span>
          <span><small>MEDIAN PEAK</small><b>3.8x</b></span>
          <span><small>SUCCESSFUL SUBSET</small><b>29</b></span>
          <span><small>FAILED SUBSET</small><b>37</b></span>
        </div>
        {tokens.slice(0, 4).map((t, i) => (
          <Link href={`/live/${t.id}`} className="matchRow" key={t.id}>
            <b>{92 - i * 4}%</b>
            <span>${t.symbol}</span>
            <span>{t.formation}</span>
            <span>Peak {6.4 - i * 1.2}x</span>
            <span>{t.retention}% retained</span>
            <ChevronRight size={14} />
          </Link>
        ))}
      </section>
      <aside className="differencePanel">
        <h3>Important differences</h3>
        <p><CheckCircle2 />Profitable-wallet entry timing is earlier than 68% of successful matches.</p>
        <p><CheckCircle2 />First-100 retention is 15 points above the full sample median.</p>
        <p className="warnText">Top-10 concentration is rising, unlike the strongest successful subset.</p>
        <small>Similarity is context, not a prediction.</small>
      </aside>
    </div>
  );
}

function Alerts() {
  return (
    <div className="alertList">
      {["Profitable wallet entered", "Creator-linked distribution", "Formation changed", "Migration completed", "Cluster activity detected", "Historical match found"].map((x, i) => (
        <article key={x}>
          <Link href="/live/bark">
            <i className={i === 1 ? "red" : i < 4 ? "green" : "purple"} />
            <div>
              <b>{x}</b>
              <p>{i === 0 ? "7xK...32a bought 1.82 SOL of BARK at $31.8K MC." : i === 1 ? "Creator-linked cohort reduced supply by 3.2%." : "New material evidence was detected for an active watchlist token."}</p>
            </div>
            <span>{i + 1}m ago</span>
            <ChevronRight />
          </Link>
          <Link className="alertAskAction" href={`/ask-aladdin?source=alert&alertId=alert-${i + 1}&token=bark&label=${encodeURIComponent("$BARK")}&alertType=${encodeURIComponent(x)}&time=${encodeURIComponent(`${i + 1}m ago`)}`}>Open in Ask Aladdin</Link>
        </article>
      ))}
    </div>
  );
}
