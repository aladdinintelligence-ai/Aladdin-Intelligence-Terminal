"use client";
import { useEffect, useState } from "react";
import { subscribeToasts, type ToastItem } from "@/app/lib/toast";

export function ToastHost() {
  const [list, setList] = useState<ToastItem[]>([]);
  useEffect(() => subscribeToasts(setList), []);
  return (
    <div className="toastHost" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
