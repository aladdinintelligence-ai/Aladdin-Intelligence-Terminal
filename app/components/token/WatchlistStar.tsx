"use client";
import { useState } from "react";
import { Star } from "lucide-react";
import { useAuth } from "@/app/hooks/useAuth";
import { useWatchlist } from "@/app/hooks/useWatchlist";
import { toast } from "@/app/lib/toast";
import { EntryModal } from "@/app/components/landing/EntryModal";

export interface WatchlistStarToken {
  mint: string;
  symbol?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  priceUsd?: number | null;
  marketCapUsd?: number | null;
  priceChange24h?: number | null;
  volume24h?: number | null;
}

// Clickable watchlist toggle: thin outline when the token is not saved,
// bold gold fill once it is. Signed-out visitors get the sign-in modal
// instead of a silent 401, and every action confirms with a popup toast.
export function WatchlistStar({ token, size = 18 }: { token: WatchlistStarToken; size?: number }) {
  const { user } = useAuth();
  const { has, add, remove, loading } = useWatchlist();
  const [entryOpen, setEntryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const watched = has(token.mint);

  const handleClick = async () => {
    if (busy || loading) return;
    if (!user) {
      setEntryOpen(true);
      return;
    }
    setBusy(true);
    try {
      if (watched) {
        await remove(token.mint);
        toast("Removed from watchlist");
      } else {
        await add(token);
        toast("Added to watchlist");
      }
    } catch {
      toast(
        watched ? "Could not remove from watchlist" : "Could not add to watchlist",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`watchStar${watched ? " watched" : ""}`}
        onClick={handleClick}
        disabled={busy || loading}
        aria-pressed={watched}
        aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
        title={watched ? "Remove from watchlist" : "Add to watchlist"}
      >
        <Star
          size={size}
          strokeWidth={watched ? 2.5 : 1.5}
          fill={watched ? "currentColor" : "none"}
        />
      </button>
      <EntryModal
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        onAuth={() => setEntryOpen(false)}
      />
    </>
  );
}
