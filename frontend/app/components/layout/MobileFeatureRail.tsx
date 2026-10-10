"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ChartNoAxesCombined,
  Eye,
  History,
  LayoutList,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
const features = [
  ["/movers", "Movers", ChartNoAxesCombined],
  ["/og", "OG", LayoutList],
  ["/formation", "Formation", Activity],
  ["/smart-money", "Smart Money", Sparkles],
  ["/insiders", "Insider", ShieldAlert],
  ["/clusters", "Clusters", Users],
  ["/historical", "Historical", History],
  ["/watchlist", "Watchlist", Eye],
] as const;
export function MobileFeatureRail() {
  const path = usePathname();
  return (
    <nav
      className="mobileFeatureRail"
      aria-label="Aladdin intelligence features"
    >
      {features.map(([href, label, Icon]) => (
        <Link
          href={href}
          className={
            path === href || path.startsWith(`${href}/`) ? "active" : ""
          }
          key={href}
        >
          <Icon />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
