"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";

/**
 * Recherche repliable à côté du titre (V4, § 13) : une loupe ouvre le champ et les 5
 * recherches récentes du compte ; une recherche active reste signalée sur la loupe.
 */
export function LibrarySearch({ q, recent, base }: { q: string; recent: string[]; base: Record<string, string | undefined> }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(q);
  const [list, setList] = useState(recent);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setValue(q), [q]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function go(query: string) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...base, q: query || undefined })) if (v) sp.set(k, v);
    const s = sp.toString();
    router.push(s ? `/?${s}` : "/");
    setOpen(false);
    if (query) {
      void fetch("/api/library/searches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: query }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { recent?: string[] } | null) => d?.recent && setList(d.recent))
        .catch(() => undefined);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`ib lib-search-toggle${q ? " is-active" : ""}`}
        aria-expanded={open}
        aria-controls="lib-search"
        aria-label={open ? t.library.searchClose : q ? `${t.library.searchOpen} — ${t.library.searchActive(q)}` : t.library.searchOpen}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={open ? "close" : "search"} />
        {q && !open && <span className="lib-search-dot" aria-hidden="true" />}
      </button>
      <div id="lib-search" className="lib-search" hidden={!open}>
        <form
          className="searchbox"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            go(value.trim().slice(0, 80));
          }}
        >
          <Icon name="search" />
          <label htmlFor="lib-q" className="sr-only">{t.library.searchLabel}</label>
          <input
            ref={inputRef}
            id="lib-q"
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            placeholder={t.library.search}
            maxLength={80}
            autoComplete="off"
            enterKeyHint="search"
          />
        </form>
        {list.length > 0 && (
          <div className="recent-searches">
            <p className="eyebrow">{t.library.recentSearches}</p>
            <ul>
              {list.map((r) => (
                <li key={r}>
                  <button type="button" onClick={() => go(r)}>
                    <Icon name="clock" size={16} /> <span>{r}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn-link small"
              onClick={() => {
                setList([]);
                void fetch("/api/library/searches", { method: "DELETE" }).catch(() => undefined);
              }}
            >
              {t.library.clearRecent}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
