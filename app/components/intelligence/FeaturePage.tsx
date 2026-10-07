"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, CheckCircle2, ChevronRight, Filter } from "lucide-react";
import { tokens } from "@/app/data/tokens";
import { money, pct } from "@/app/utils/format";
import { Badge } from "@/app/components/ui/Badge";
import MetaLine from "@/app/components/intelligence/MetaLine";
import { behaviourColor } from "@/app/utils/behaviour";
import { useMovers, type MoverToken } from "@/app/hooks/useMovers";
import { useOg, type OgToken, type OgMeta } from "@/app/hooks/useOg";
import { useSmartMoney, type SmartWallet, type SmartMoneyMeta } from "@/app/hooks/useSmartMoney";
import { useFormation, type FormationToken, type FormationMeta } from "@/app/hooks/useFormation";
import { useInsider, type InsiderToken, type InsiderMeta } from "@/app/hooks/useInsider";
import { useClusters, type ClusterToken, type ClusterMeta } from "@/app/hooks/useClusters";
import { useHistorical, type HistoricalToken, type HistoricalHero, type HistoricalMeta } from "@/app/hooks/useHistorical";

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
  const og = useOg(20, kind === "og");
  const smart = useSmartMoney(20, kind === "smart-money");
  const formation = useFormation(20, kind === "formation");
  const insider = useInsider(20, kind === "insiders");
  const clusters = useClusters(20, kind === "clusters");
  const historical = useHistorical(6, kind === "historical");
  const liveMeta: { source: string; fetchedAt: string; coverage: string; askTarget?: string } | null =
    kind === "og" ? og.meta
      : kind === "smart-money" ? smart.meta
        : kind === "formation" ? formation.meta
          : kind === "insiders" ? insider.meta
            : kind === "clusters" ? clusters.meta
              : kind === "historical" ? historical.meta
                : null;

  return (
    <>
      <div className="pageTitle">
        <div>
          <span className="eyebrow">{c.eyebrow}</span>
          <h1>{c.title}</h1>
          <p>{c.desc}</p>
        </div>
        {liveMeta?.askTarget ? (
          <Link className="primary" href={liveMeta.askTarget}>Open in Ask Aladdin <ArrowUpRight size={14} /></Link>
        ) : (
          <button className="primary">Open in Ask Aladdin <ArrowUpRight size={14} /></button>
        )}
      </div>
      <div className="decisionQuestion">
        <span>TRADING QUESTION</span>
        <b>{c.question}</b>
        <small>Open Data Details for source and freshness</small>
      </div>
      {liveMeta ? (
        <details className="dataDetails">
          <summary>Open Data Details</summary>
          <p>Source: {liveMeta.source}</p>
          <p>As of {new Date(liveMeta.fetchedAt).toLocaleString()}</p>
          <p>{liveMeta.coverage}</p>
        </details>
      ) : null}
      <div className="toolbar">
        <div className="tabs">
          {["All", "High signal", "New", "Changed"].map(x => (
            <button key={x} onClick={() => setFilter(x)} className={filter === x ? "active" : ""}>{x}</button>
          ))}
        </div>
        <button><Filter size={14} />Refine</button>
      </div>
      {kind === "smart-money" ? <WalletTable wallets={smart.wallets} meta={smart.meta} loading={smart.loading} error={smart.error} filter={filter} /> :
       kind === "formation" ? <FormationRows tokens={formation.tokens} meta={formation.meta} loading={formation.loading} error={formation.error} filter={filter} /> :
       kind === "insiders" ? <InsiderRows tokens={insider.tokens} meta={insider.meta} loading={insider.loading} error={insider.error} filter={filter} /> :
       kind === "narratives" ? <Narratives /> :
       kind === "clusters" ? <ClusterRows tokens={clusters.tokens} meta={clusters.meta} loading={clusters.loading} error={clusters.error} filter={filter} /> :
       kind === "historical" ? <HistoricalRows tokens={historical.tokens} hero={historical.hero} meta={historical.meta} loading={historical.loading} error={historical.error} filter={filter} /> :
       kind === "alerts" ? <Alerts /> :
       kind === "og" ? <OgRows tokens={og.tokens} meta={og.meta} loading={og.loading} error={og.error} filter={filter} /> :
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
            <b>{kind === "movers" ? (t.buyers != null ? `${t.buyers} buyers` : "—") : kind === "formation" ? (i === 0 ? "DISCOVERY → BROAD ACCUMULATION" : "Profitable flow increasing") : t.buyers != null ? `${t.buyers} buyers` : "—"}</b>
          </div>
          <div>
            <small>MARKET</small>
            <b>{money(t.mc)} <em className={t.change != null && t.change < 0 ? "negative" : ""}>{t.change != null ? pct(t.change) : "—"}</em></b>
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

const compact = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? "—" : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : String(v);

function OgRows({ tokens, meta, loading, error, filter }: { tokens: OgToken[]; meta: OgMeta | null; loading: boolean; error: string | null; filter: string }) {
  if (loading) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>Loading OG workspace...</span></div></div>;
  }

  if (error) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>{error}</span></div></div>;
  }

  if (tokens.length === 0) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>No OG tokens available</span></div></div>;
  }

  const shown = tokens.filter(t =>
    filter === "All" || (filter === "High signal" ? t.highSignal : filter === "New" ? t.isNew : filter === "Changed" ? t.isChanged : true)
  );

  if (shown.length === 0) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>No tokens match this filter</span></div></div>;
  }

  return (
    <div className="evidenceRows">
      {meta ? <MetaLine label="established assets" count={meta.count} fetchedAt={meta.fetchedAt} stale={meta.stale} /> : null}
      {shown.map(t => (
        <Link href={`/live/${t.mint || t.id}`} className="evidenceRow ogRow" key={t.mint || t.id}>
          {t.imageUrl ? (
            <img src={t.imageUrl} alt={t.symbol} className="coin" style={{ objectFit: "cover" }} />
          ) : (
            <span className="coin" style={{ background: t.color }}>{t.symbol[0]}</span>
          )}
          <div className="evidenceIdentity">
            <b>${t.symbol}</b>
            <small>{t.ageDays !== null ? `${Math.round(t.ageDays)}d old` : t.name}</small>
          </div>
          <div>
            <small>CURRENT STATE</small>
            <Badge>{t.formation}</Badge>
          </div>
          <div>
            <small>BEHAVIOURAL CHANGE</small>
            <b>{t.behaviouralChange}</b>
          </div>
          <div>
            <small>MARKET</small>
            <b>{money(t.mc)} <em className={t.change !== null && t.change < 0 ? "negative" : ""}>{t.change !== null ? pct(t.change) : "—"}</em></b>
          </div>
          <div>
            <small>MATURE STRUCTURE</small>
            <b>${compact(t.liquidity)} liq · ${compact(t.volume)} vol</b>
            <em>{t.holders ? `${compact(t.holders)} holders · Top10 ${t.top10 != null ? `${t.top10}%` : "—"}` : "—"}</em>
          </div>
          <div>
            <small>WHY IT MATTERS</small>
            <span>{t.whyItMatters}</span>
          </div>
          <ChevronRight size={16} />
        </Link>
      ))}
    </div>
  );
}

function FormationRows({ tokens, meta, loading, error, filter }: { tokens: FormationToken[]; meta: FormationMeta | null; loading: boolean; error: string | null; filter: string }) {
  if (loading) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>Loading market formations...</span></div></div>;
  }

  if (error) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>{error}</span></div></div>;
  }

  if (tokens.length === 0) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>No formations available</span></div></div>;
  }

  const shown = tokens.filter(t =>
    filter === "All" ? true : filter === "High signal" ? t.highSignal : filter === "New" ? t.isNew : filter === "Changed" ? t.isChanged : true
  );

  if (shown.length === 0) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>No formations match this filter</span></div></div>;
  }

  return (
    <div className="evidenceRows">
      {meta ? <MetaLine label="formations live" count={meta.count} fetchedAt={meta.fetchedAt} stale={meta.stale} /> : null}
      {shown.map(t => (
        <Link href={`/live/${t.mint || t.id}`} className="evidenceRow formationRow" key={t.mint || t.id}>
          {t.imageUrl ? (
            <img src={t.imageUrl} alt={t.symbol} className="coin" style={{ objectFit: "cover" }} />
          ) : (
            <span className="coin" style={{ background: t.color }}>{t.symbol[0]}</span>
          )}
          <div className="evidenceIdentity">
            <b>${t.symbol}</b>
            <small>{t.ageDays !== null ? `${t.ageDays}d old` : t.name}</small>
          </div>
          <div>
            <small>CURRENT STATE</small>
            <Badge>{t.formation}</Badge>
          </div>
          <div>
            <small>PARTICIPATION</small>
            <b>{t.buyers != null ? t.buyers.toLocaleString("en-US") : "—"} buyers · Top10 {t.top10 != null ? `${t.top10}%` : "—"}</b>
            <em>top wallet {t.top1 != null ? `${t.top1}%` : "—"} of buys</em>
          </div>
          <div>
            <small>MARKET</small>
            <b>{money(t.mc)} <em className={t.change !== null && t.change < 0 ? "negative" : ""}>{t.change !== null ? pct(t.change) : "—"}</em></b>
          </div>
          <div>
            <small>FLOW</small>
            <b>Buy {money(t.buyUsd)} / Sell {money(t.sellUsd)}</b>
            <em>{t.profitable !== null ? `${t.profitable}% profitable` : "—"} · {t.residence !== null ? `${t.residence}% migrated` : "bonding"}</em>
          </div>
          <div>
            <small>WHY IT MATTERS</small>
            <span>{t.why}</span>
          </div>
          <ChevronRight size={16} />
        </Link>
      ))}
    </div>
  );
}

const insiderStageColor = (stage: string): string =>
  stage === "ACCUMULATING" ? "#33d6a6" : stage === "DISTRIBUTING" ? "#ec795f" : stage === "EXITING" ? "#d872f2" : "#58a9f4";

const entryAgo = (entryMin: number | null): string => {
  if (entryMin == null) return "—";
  return entryMin >= 60 ? `${Math.round(entryMin / 60)}h ago` : `${entryMin}m ago`;
};

function InsiderRows({ tokens, meta, loading, error, filter }: { tokens: InsiderToken[]; meta: InsiderMeta | null; loading: boolean; error: string | null; filter: string }) {
  if (loading) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>Loading insider activity...</span></div></div>;
  }

  if (error) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>{error}</span></div></div>;
  }

  if (tokens.length === 0) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>No insider activity data available</span></div></div>;
  }

  const shown = tokens.filter(t =>
    filter === "All" ? true : filter === "High signal" ? t.highSignal : filter === "New" ? t.isNew : filter === "Changed" ? t.isChanged : true
  );

  if (shown.length === 0) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>No tokens match this filter</span></div></div>;
  }

  return (
    <div className="evidenceRows">
      {meta ? <MetaLine label="insider cohorts tracked" count={meta.count} fetchedAt={meta.fetchedAt} stale={meta.stale} /> : null}
      {shown.map(t => (
        <Link href={`/live/${t.mint || t.id}`} className="evidenceRow insiderRow" key={t.mint || t.id}>
          {t.imageUrl ? (
            <img src={t.imageUrl} alt={t.symbol} className="coin" style={{ objectFit: "cover" }} />
          ) : (
            <span className="coin" style={{ background: t.color }}>{t.symbol[0]}</span>
          )}
          <div className="evidenceIdentity">
            <b>${t.symbol}</b>
            <small>{t.ageDays !== null ? `${t.ageDays}d old` : t.name}</small>
          </div>
          <div>
            <small>CURRENT STATE</small>
            <Badge color={insiderStageColor(t.stage)}>{t.stage}</Badge>
          </div>
          <div>
            <small>LINKED SUPPLY</small>
            <b>{t.cohortSize != null ? t.cohortSize.toLocaleString("en-US") : "—"} wallets · 48h</b>
            <em>{t.buyers != null ? t.buyers.toLocaleString("en-US") : "—"} buyers · lead {t.lead ? `${t.lead.id}…` : "—"} entered {entryAgo(t.lead ? t.lead.entryMin : null)}</em>
          </div>
          <div>
            <small>SUPPLY FLOW</small>
            <b>{t.cohortNetUsd != null ? (t.cohortNetUsd >= 0 ? `Net ${money(t.cohortNetUsd)} sold` : `Net ${money(-t.cohortNetUsd)} added`) : "Net —"}</b>
            <em>{t.cohortPressure != null ? `Pressure ${t.cohortPressure >= 0 ? "+" : ""}${t.cohortPressure}%` : "—"} · avg sold {t.cohortAvgSold != null ? `${t.cohortAvgSold}%` : "—"}</em>
          </div>
          <div>
            <small>MARKET</small>
            <b>{money(t.mc)} <em className={t.change !== null && t.change < 0 ? "negative" : ""}>{t.change !== null ? pct(t.change) : "—"}</em></b>
          </div>
          <div>
            <small>WHY IT MATTERS</small>
            <span>{t.why}</span>
          </div>
          <ChevronRight size={16} />
        </Link>
      ))}
    </div>
  );
}

function WalletTable({ wallets, meta, loading, error, filter }: { wallets: SmartWallet[]; meta: SmartMoneyMeta | null; loading: boolean; error: string | null; filter: string }) {
  if (loading) {
    return <div className="dataTable walletTable"><div className="launchEmpty"><span>Loading proven wallets...</span></div></div>;
  }

  if (error) {
    return <div className="dataTable walletTable"><div className="launchEmpty"><span>{error}</span></div></div>;
  }

  if (wallets.length === 0) {
    return <div className="dataTable walletTable"><div className="launchEmpty"><span>No proven wallet data available</span></div></div>;
  }

  const shown = wallets.filter(w =>
    filter === "All"
      ? true
      : filter === "High signal"
        ? w.behaviour === "Smart Money" || (w.winRate >= 60 && w.computableTokens >= 2)
        : filter === "New"
          ? w.openCount > 0
          : filter === "Changed"
            ? w.realizedPnl > 0 && w.holdingPct < 50
            : true
  );

  if (shown.length === 0) {
    return <div className="dataTable walletTable"><div className="launchEmpty"><span>No wallets match this filter</span></div></div>;
  }

  return (
    <div className="dataTable walletTable">
      <div className="tr head">
        <span>WALLET</span><span>WHY STRONG</span><span>REALIZED PNL</span>
        <span>WIN RATE</span><span>SAMPLE</span><span>ENTRY STAGE</span>
        <span>OPEN POSITION</span><span></span><span></span>
      </div>
      {meta ? <MetaLine label="proven wallets" count={meta.count} fetchedAt={meta.fetchedAt} stale={meta.stale} /> : null}
      {shown.map(w => {
        const short = `${w.address.slice(0, 4)}...${w.address.slice(-4)}`;
        return (
          <Link href={`/wallet/${w.id}`} className="tr" key={w.address}>
            <b>{short}</b>
            <span><Badge color={(behaviourColor as Record<string, string>)[w.behaviour] || "#8b7cf6"}>{w.behaviour}</Badge></span>
            <b className="buy">{money(w.realizedPnl)}</b>
            <span>{w.winRate != null ? `${w.winRate}%` : "—"}</span>
            <span>{w.sampleTokens != null ? `${w.sampleTokens} tokens` : "—"}</span>
            <span>{w.entryStage ? `${w.entryStage.label} into ${w.entryStage.token}` : "—"}</span>
            <span>{w.openUsd != null && w.openUsd > 0 ? `${money(w.openUsd)} · ${w.holdingPct != null ? `${w.holdingPct}%` : "—"}` : "Fully exited"}</span>
            <span>{w.repeatable ? "Repeatable" : "—"}</span>
            <ChevronRight size={14} />
          </Link>
        );
      })}
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

const clusterStageColor = (stage: string): string =>
  stage === "ACCUMULATING" ? "#33d6a6" : stage === "DISTRIBUTING" ? "#ec795f" : "#58a9f4";

function ClusterRows({ tokens, meta, loading, error, filter }: { tokens: ClusterToken[]; meta: ClusterMeta | null; loading: boolean; error: string | null; filter: string }) {
  if (loading) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>Loading coordinated wallets...</span></div></div>;
  }

  if (error) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>{error}</span></div></div>;
  }

  if (tokens.length === 0) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>No coordinated clusters detected</span></div></div>;
  }

  const shown = tokens.filter(t =>
    filter === "All" ? true : filter === "High signal" ? t.highSignal : filter === "New" ? t.isNew : filter === "Changed" ? t.isChanged : true
  );

  if (shown.length === 0) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>No clusters match this filter</span></div></div>;
  }

  return (
    <div className="evidenceRows">
      {meta ? <MetaLine label="wallet clusters detected" count={meta.count} fetchedAt={meta.fetchedAt} stale={meta.stale} /> : null}
      {shown.map(t => (
        <Link href={`/live/${t.representativeMint || t.id}`} className="evidenceRow clusterRow" key={t.id}>
          <span className="coin" style={{ background: t.color }}>{t.name[0]}</span>
          <div className="evidenceIdentity">
            <b>{t.name}</b>
            <small>{t.walletCount != null ? `${t.walletCount}` : "—"} wallets · {t.tokenCount != null ? `${t.tokenCount}` : "—"} tokens</small>
          </div>
          <div>
            <small>CURRENT STATE</small>
            <Badge color={clusterStageColor(t.stage)}>{t.stage}</Badge>
          </div>
          <div>
            <small>OVERLAP</small>
            <b>{t.sharedTokenCount != null ? `${t.sharedTokenCount} shared tokens` : "—"}</b>
            <em>{t.coMovements != null ? `${t.coMovements} timed co-movements` : "—"}</em>
          </div>
          <div>
            <small>SUPPLY FLOW</small>
            <b>{t.netUsd != null ? (t.netUsd >= 0 ? `Net ${money(t.netUsd)} sold` : `Net ${money(-t.netUsd)} added`) : "Net —"}</b>
            <em className={t.pressure !== null && t.pressure < 0 ? "negative" : ""}>{t.pressure != null ? `Pressure ${t.pressure >= 0 ? "+" : ""}${t.pressure}%` : "—"}</em>
          </div>
          <div>
            <small>TOP TOKENS</small>
            <b>{t.topTokens.slice(0, 3).map(x => `$${x.symbol}`).join(" · ") || "—"}</b>
            <em>members {t.members.slice(0, 4).map(m => m.id).join(", ")}{t.members.length > 4 ? "…" : ""}</em>
          </div>
          <div>
            <small>WHY IT MATTERS</small>
            <span>{t.why}</span>
          </div>
          <ChevronRight size={16} />
        </Link>
      ))}
    </div>
  );
}

function HistoricalRows({ tokens, hero, meta, loading, error, filter }: { tokens: HistoricalToken[]; hero: HistoricalHero | null; meta: HistoricalMeta | null; loading: boolean; error: string | null; filter: string }) {
  if (loading) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>Matching live formations against the active pool...</span></div></div>;
  }

  if (error) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>{error}</span></div></div>;
  }

  if (tokens.length === 0) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>No historical match data available yet</span></div></div>;
  }

  const shown = tokens.filter(t =>
    filter === "All" ? true : filter === "High signal" ? t.signal : filter === "New" ? t.isNew : filter === "Changed" ? t.isChanged : true
  );

  if (shown.length === 0) {
    return <div className="evidenceRows"><div className="launchEmpty"><span>No matches fit this filter</span></div></div>;
  }

  const lead = shown[0];
  const leadDiffs = (lead && lead.differences && lead.differences.length ? lead.differences : []).slice(0, 3);

  return (
    <div className="historyLayout">
      <section>
        {hero ? (
          <div className="matchHero">
            <span><small>FORMATION MATCHES</small><b>{hero.matches}</b></span>
            <span><small>MEDIAN PEAK</small><b>{hero.medianPeak != null ? `${hero.medianPeak.toFixed(1)}x` : "—"}</b></span>
            <span><small>SUCCESSFUL SUBSET</small><b>{hero.successful != null ? hero.successful : "—"}</b></span>
            <span><small>FAILED SUBSET</small><b>{hero.failed != null ? hero.failed : "—"}</b></span>
          </div>
        ) : null}
        {meta ? <MetaLine label="formations matched" count={meta.count} sub={`out of ${hero ? hero.analyzed : "—"} analysed`} fetchedAt={meta.fetchedAt} stale={meta.stale} /> : null}
        {shown.map(t => (
          <Link href={`/live/${t.mint || t.id}`} className="matchRow" key={t.id}>
            <b>{t.similarity != null ? `${t.similarity}%` : "—"}</b>
            <span>${t.symbol}</span>
            <span>{t.formation}</span>
            <span>Peak {t.medianPeak != null ? `${t.medianPeak.toFixed(1)}x` : "—"}</span>
            <span>{t.retained != null ? `${t.retained}% retained` : "—"}</span>
            <ChevronRight size={14} />
          </Link>
        ))}
      </section>
      <aside className="differencePanel">
        <h3>Important differences</h3>
        {lead && lead.topMatch ? (
          <p><CheckCircle2 />Closest match $ {lead.topMatch.symbol} — {lead.topMatch.similarity}% similar, resolved {lead.topMatch.outcome} ({lead.topMatch.difference}).</p>
        ) : null}
        {leadDiffs.map(d => (
          <p key={d} className="warnText">{d}</p>
        ))}
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
