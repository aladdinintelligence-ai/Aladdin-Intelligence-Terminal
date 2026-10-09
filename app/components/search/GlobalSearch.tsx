/* eslint-disable @next/next/no-img-element */
"use client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, Search, X } from "lucide-react";
import { searchTokens, TokenSearchResult } from "@/app/services/search";
import { money } from "@/app/utils/format";

const HISTORY_KEY = "aladdin-search-history";

interface HistoryItem {
  type: "token";
  key: string;
  label: string;
}

const AVATAR_HUES = [262, 158, 198, 12, 45, 88, 210, 320];

function shortMint(mint: string): string {
  return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}

function hueFor(mint: string): number {
  let h = 0;
  for (let i = 0; i < mint.length; i += 1) h = (h * 31 + mint.charCodeAt(i)) % 997;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

function TokenAvatar({ token }: { token: TokenSearchResult }) {
  if (token.imageUrl) {
     
    return <img className="srCoin" src={token.imageUrl} alt={token.symbol} />;
  }
  return (
    <span className="srCoin letter" style={{ background: `hsl(${hueFor(token.mint)} 70% 46%)` }}>
      {token.symbol?.[0]?.toUpperCase() || "?"}
    </span>
  );
}

function formatPrice(p: number | null): string {
  if (p == null) return "—";
  if (p < 0.000001) return `$${p.toFixed(10)}`;
  if (p < 0.01) return `$${p.toFixed(8)}`;
  if (p < 1) return `$${p.toFixed(6)}`;
  return `$${p.toFixed(4)}`;
}

export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TokenSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"));
    } catch {}
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const openSearch = () => {
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    };
    addEventListener("keydown", key);
    addEventListener("aladdin:open-search", openSearch);
    return () => {
      removeEventListener("keydown", key);
      removeEventListener("aladdin:open-search", openSearch);
    };
  }, []);

  const trimmed = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setError(null);
      setActive(0);
      return;
    }
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await searchTokens(trimmed, ctrl.signal);
        setResults(res);
        setActive(res.length ? 0 : -1);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setResults([]);
        setError(
          (err as { status?: number })?.status === 503
            ? "Token search is temporarily unavailable. Try again in a few seconds."
            : "Search failed. Try again.",
        );
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [trimmed]);

  function navigate(mint: string, label: string) {
    setHistory((old) => {
      const next = [
        { type: "token" as const, key: mint, label },
        ...old.filter((x) => x.key !== mint || x.type !== "token"),
      ].slice(0, 5);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    setOpen(false);
    setQuery("");
    router.push(`/live/${mint}`);
  }

  function go() {
    if (trimmed && results.length) {
      const hit = results[Math.max(0, active)];
      if (hit) navigate(hit.mint, `$${hit.symbol}`);
    } else if (trimmed) {
      setOpen(false);
      router.push(`/ask-aladdin?q=${encodeURIComponent(trimmed)}`);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    go();
  }

  const statusText = error
    ? "SEARCH UNAVAILABLE"
    : loading
      ? "SEARCHING"
      : trimmed
        ? results.length
          ? `${results.length} RESULT${results.length === 1 ? "" : "S"} · SOLANA`
          : "NO MATCHES"
        : "TOKEN SEARCH";

  return (
    <>
      <button
        className="navSearch"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        <Search />
        <span>Search tokens…</span>
        <kbd>/</kbd>
      </button>
      {mounted && open && createPortal(
        <div
          className="searchOverlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <section className="searchSurface">
            <header>
              <img src="/aladdin-logo.jpg" alt="Aladdin" />
              <form onSubmit={submit}>
                <Search />
                <input
                  ref={inputRef}
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActive((a) => (a < results.length - 1 ? a + 1 : 0));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActive((a) => (a > 0 ? a - 1 : results.length - 1));
                    }
                  }}
                  placeholder="Search token, mint or symbol…"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")}>
                    <X />
                  </button>
                )}
                <button type="submit">
                  <ArrowRight />
                </button>
              </form>
              <button className="closeSearch" onClick={() => setOpen(false)}>
                ESC
              </button>
            </header>
            <div className="resolverStatus">
              <span>
                {statusText}
                {loading && " · UPDATING"}
              </span>
              <i className={results.length ? "resolved" : ""} />
            </div>
            <main>
              {trimmed ? (
                loading && !results.length ? (
                  <div className="searchEmpty">
                    <LoaderCircle className="spin" size={18} />
                    <span>Searching Solana tokens…</span>
                  </div>
                ) : error ? (
                  <div className="searchEmpty error">
                    <b>Search unavailable</b>
                    <span>{error}</span>
                  </div>
                ) : results.length ? (
                  <ul className="searchResults">
                    {results.map((token, i) => (
                      <li key={token.mint}>
                        <button
                          className={`searchResultRow${i === active ? " active" : ""}`}
                          onMouseEnter={() => setActive(i)}
                          onClick={() => navigate(token.mint, `$${token.symbol}`)}
                        >
                          <TokenAvatar token={token} />
                          <div className="srIdent">
                            <b>
                              ${token.symbol} <em>{token.name}</em>
                            </b>
                            <small>
                              {shortMint(token.mint)}
                              {token.dexId ? ` · ${token.dexId}` : ""}
                            </small>
                          </div>
                          <div className="srStats">
                            <b>{formatPrice(token.priceUsd)}</b>
                            <em
                              className={
                                token.priceChange24h == null
                                  ? ""
                                  : token.priceChange24h >= 0
                                    ? "up"
                                    : "down"
                              }
                            >
                              {token.priceChange24h != null
                                ? `${token.priceChange24h >= 0 ? "+" : ""}${token.priceChange24h.toFixed(2)}%`
                                : "—"}
                            </em>
                            <small>
                              {token.marketCapUsd != null
                                ? `MC ${money(token.marketCapUsd)}`
                                : token.liquidityUsd != null
                                  ? `LIQ ${money(token.liquidityUsd)}`
                                  : ""}
                            </small>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="searchEmpty">
                    <b>No tokens found</b>
                    <span>
                      No Solana token matched &ldquo;{trimmed}&rdquo;. Ask Aladdin
                      to investigate it instead.
                    </span>
                    <button className="searchAsk" onClick={() => go()}>
                      Ask Aladdin about &ldquo;{trimmed}&rdquo; <ArrowRight />
                    </button>
                  </div>
                )
              ) : history.length ? (
                <div className="searchHistory">
                  <small>RECENT</small>
                  {history.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => navigate(item.key, item.label)}
                    >
                      <b>{item.label}</b>
                      <span>· {item.key.slice(0, 8)}…</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="searchEmpty">
                  <b>Search any Solana token</b>
                  <span>Type a symbol, name or mint address — results will open the live terminal.</span>
                </div>
              )}
            </main>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}