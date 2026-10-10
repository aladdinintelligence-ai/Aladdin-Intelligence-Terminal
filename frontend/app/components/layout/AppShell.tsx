"use client";
import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileFeatureRail } from "./MobileFeatureRail";
const traderPaths = [
  "/launches",
  "/narratives",
  "/movers",
  "/og",
  "/formation",
  "/smart-money",
  "/insiders",
  "/clusters",
  "/historical",
  "/watchlist",
  "/alerts",
  "/live",
  "/token",
  "/wallet",
];
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  if (path === "/") return <>{children}</>;
  const showFeatureRail = traderPaths.some(
    (route) => path === route || path.startsWith(`${route}/`),
  );
  return (
    <div className="shell">
      <Sidebar />
      <div className="workspace">
        <TopBar showMarketData={path !== "/ask-aladdin"} />
        {showFeatureRail ? <MobileFeatureRail /> : null}
        <main>{children}</main>
      </div>
    </div>
  );
}
