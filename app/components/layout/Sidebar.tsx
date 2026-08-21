/* eslint-disable @next/next/no-img-element */
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  BrainCircuit,
  ChartNoAxesCombined,
  ChevronDown,
  Eye,
  Flame,
  History,
  LayoutList,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { GlobalSearch } from "@/app/components/search/GlobalSearch";
import { AccountControl } from "@/app/components/account/AccountControl";
import { MobileDock } from "./MobileDock";
import { MobileTopBar } from "./MobileTopBar";
const market = [
  ["/launches", "Launches", ChartNoAxesCombined],
  ["/movers", "Movers + Why", ChartNoAxesCombined],
  ["/narratives", "Narratives", Flame],
  ["/og", "Established / OG", LayoutList],
] as const;
const intelligence = [
  ["/smart-money", "Smart Money", Sparkles],
  ["/formation", "Market Formation", Activity],
  ["/insiders", "Insider Activity", ShieldAlert],
  ["/clusters", "Coordinated Wallets", Users],
] as const;
export function Sidebar() {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  return (
    <>
      <header className="appNav">
        <Link href="/launches" className="brand">
          <img className="brandLogo" src="/aladdin-logo.jpg" alt="Aladdin" />
          <span>
            ALADDIN<small>INTELLIGENCE</small>
          </span>
        </Link>
        <nav className="desktopNav">
          <Menu label="Market" items={market} active={active} />
          <Menu label="Intelligence" items={intelligence} active={active} />
          <Link
            className={active("/historical") ? "active" : ""}
            href="/historical"
          >
            <History />
            Historical
          </Link>
          <Link
            className={active("/ask-aladdin") ? "active" : ""}
            href="/ask-aladdin"
          >
            <BrainCircuit />
            Ask Aladdin
          </Link>
          <Link
            className={active("/watchlist") ? "active" : ""}
            href="/watchlist"
          >
            <Eye />
            Watchlist
          </Link>
          <Link className={active("/alerts") ? "active" : ""} href="/alerts">
            <Bell />
            Alerts
          </Link>
        </nav>
        <GlobalSearch />
        <AccountControl />
      </header>
      <MobileTopBar />
      <MobileDock path={path} />
    </>
  );
}
function Menu({
  label,
  items,
  active,
}: {
  label: string;
  items: typeof market | typeof intelligence;
  active: (href: string) => boolean;
}) {
  return (
    <div
      className={`navMenu ${items.some(([href]) => active(href)) ? "active" : ""}`}
    >
      <button>
        {label}
        <ChevronDown />
      </button>
      <div className="navMenuPanel">
        {items.map(([href, itemLabel, Icon]) => (
          <Link className={active(href) ? "active" : ""} href={href} key={href}>
            <Icon />
            {itemLabel}
          </Link>
        ))}
      </div>
    </div>
  );
}
