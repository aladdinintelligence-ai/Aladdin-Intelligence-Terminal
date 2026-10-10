"use client";
import { useContext } from "react";
import {
  WatchlistContext,
  type WatchlistContextValue,
} from "@/app/contexts/WatchlistContext";

export function useWatchlist(): WatchlistContextValue {
  const value = useContext(WatchlistContext);
  if (!value) throw new Error("useWatchlist must be used inside WatchlistProvider");
  return value;
}
