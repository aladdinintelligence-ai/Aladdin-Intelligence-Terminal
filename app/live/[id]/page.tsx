import { tokenById } from "@/app/data/tokens";
import { money, pct } from "@/app/utils/format";
import { TokenChart } from "@/app/components/token/TokenChart";
import { IfaNow } from "@/app/components/ifa/IfaNow";
import { TerminalInvestigation } from "@/app/components/token/TerminalInvestigation";
import { Badge } from "@/app/components/ui/Badge";

export default async function Live({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  const t = tokenById(id);
  return (
    <>
      <div className="tokenHero">
        <span className="coin large" style={{ background: t.color }}>
          {t.symbol[0]}
        </span>
        <div className="tokenName">
          <span>LIVE TERMINAL</span>
          <h1>
            ${t.symbol} <small>{t.name}</small>
          </h1>
          <p>
            7hkL...pump <button>Copy</button> {"\u00b7"} {t.age} old
          </p>
        </div>
        <div className="heroMetrics">
          <div>
            <small>MARKET CAP</small>
            <b>{money(t.mc)}</b>
            <em>{pct(t.change)}</em>
          </div>
          <div>
            <small>LIQUIDITY</small>
            <b>{money(t.liquidity)}</b>
          </div>
          <div>
            <small>24H VOLUME</small>
            <b>{money(t.volume)}</b>
          </div>
          <div>
            <small>HOLDERS</small>
            <b>{t.holders}</b>
            <span>+34 / 5m</span>
          </div>
          <div>
            <small>MIGRATION</small>
            <b>{t.migration}%</b>
          </div>
        </div>
        <Badge>{t.formation}</Badge>
      </div>
      <div className="terminalGrid">
        <TokenChart tokenId={t.id} />
        <IfaNow />
      </div>
      <TerminalInvestigation token={t} initialView={view} />
    </>
  );
}
