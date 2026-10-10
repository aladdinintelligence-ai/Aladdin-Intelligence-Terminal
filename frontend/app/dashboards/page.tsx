"use client";
import { BackButton } from "@/app/components/navigation/BackButton";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadDashboards } from "@/app/services/workspace-local";
import type { Dashboard } from "@/app/types/workspace";
export default function Dashboards() {
  const [items, setItems] = useState<Dashboard[]>([]);
  useEffect(() => setItems(loadDashboards()), []);
  return (
    <>
      <div className="workspacePageBack">
        <BackButton fallback="/ask-aladdin" />
      </div>
      <div className="pageTitle">
        <div>
          <span className="eyebrow">ASK ALADDIN WORKSPACE</span>
          <h1>Dashboards</h1>
          <p>Approved views built from saved structured queries.</p>
        </div>
      </div>
      <div className="workspaceIndex">
        {items.length ? (
          items.map((item) => (
            <Link href={`/dashboards/${item.id}`} key={item.id}>
              <b>{item.name}</b>
              <span>
                {item.panels.length} approved panels · {item.visibility}
              </span>
              <small>{item.refreshLabel}</small>
            </Link>
          ))
        ) : (
          <p>No dashboards yet.</p>
        )}
      </div>
    </>
  );
}
