"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import { keyboardLikelyOpen, matchesQuery, shouldCollapse } from "@/lib/library/search";
import { MovePanel } from "./MovePanel";
import { ReportRow, type RowData } from "./ReportRow";

type Section = "folders" | "limpids";
const COLLAPSE_KEY = "limpid-library-collapsed";

function readCollapsed(): Set<Section> {
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "[]") as unknown;
    return new Set((Array.isArray(raw) ? raw : []).filter((s): s is Section => s === "folders" || s === "limpids"));
  } catch {
    return new Set();
  }
}

function writeCollapsed(s: Set<Section>) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...s]));
  } catch {
    // Stockage indisponible (navigation privée) : le repli vaut pour la visite.
  }
}

/** Titre de section repliable : le nombre d'éléments reste visible une fois replié. */
function SectionToggle({ id, label, count, open, onToggle }: { id: string; label: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <h2 id={id} className="eyebrow lib-section-title">
      <button type="button" className="lib-toggle" aria-expanded={open} aria-controls={`${id}-list`} onClick={onToggle}>
        <Icon name="chevron" size={16} className="lib-toggle-chevron" />
        <span>{label}</span>
        <span className="lib-toggle-count">{count}</span>
      </button>
    </h2>
  );
}

export interface FolderItem {
  id: string;
  name: string;
  count: number;
}

const DEBOUNCE_MS = 250;

/**
 * Bibliothèque côté client (V5, § 6 à 8) : recherche instantanée dans le flux (aucun réseau ni
 * IA pendant la saisie), repli selon le clavier, sélection multiple et « Déplacer vers… ».
 */
export function LibraryBrowser({
  title,
  folder,
  folders,
  allFolders,
  rows,
  root,
  filters,
  headerExtra,
  footer,
  emptyText,
  recent: initialRecent,
  initialQuery,
  showFailure,
  newFolder,
}: {
  title: string;
  folder: { id: string; name: string } | null;
  /** Dossiers affichés (racine). */
  folders: FolderItem[];
  /** Tous les dossiers (destinations du déplacement). */
  allFolders: { id: string; name: string }[];
  /** Limpid de la portée (filtre appliqué) ; à la racine, y compris ceux rangés en dossier. */
  rows: RowData[];
  root: boolean;
  filters: React.ReactNode;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  emptyText: string;
  recent: string[];
  initialQuery: string;
  showFailure: boolean;
  newFolder: React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(!!initialQuery);
  const [value, setValue] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [recent, setRecent] = useState(initialRecent);
  const [kb, setKb] = useState({ open: false, seen: false });
  const [focusInside, setFocusInside] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  // Sections repliées (Dossiers, Limpid) : préférence de l'appareil, relue après l'hydratation.
  const [collapsed, setCollapsed] = useState<Set<Section>>(new Set());
  useEffect(() => setCollapsed(readCollapsed()), []);
  const toggleSection = (s: Section) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      writeCollapsed(next);
      return next;
    });
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const saved = useRef<string>("");
  const baseline = useRef({ w: 0, h: 0 });

  // Requête appliquée 250 ms après la dernière frappe (pas pendant une composition).
  useEffect(() => {
    if (composing.current) return;
    const id = setTimeout(() => setQuery(value), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [value]);

  // La requête est gardée dans l'adresse : le retour depuis un Limpid la restaure.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("q", query.trim());
    else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [query]);

  // Clavier virtuel : hauteur visible comparée à la plus grande hauteur vue à cette largeur.
  useEffect(() => {
    const measure = () => {
      const vv = window.visualViewport;
      const h = Math.min(window.innerHeight, vv?.height ?? window.innerHeight);
      if (baseline.current.w !== window.innerWidth) baseline.current = { w: window.innerWidth, h };
      baseline.current.h = Math.max(baseline.current.h, h);
      const isOpen = keyboardLikelyOpen(baseline.current.h, h, vv?.scale ?? 1);
      setKb((k) => (k.open === isOpen ? k : { open: isOpen, seen: k.seen || isOpen }));
    };
    measure();
    window.visualViewport?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    return () => {
      window.visualViewport?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    if (shouldCollapse({ query: value, keyboardOpen: kb.open, keyboardSeen: kb.seen, focusInside })) {
      const id = setTimeout(() => setOpen(false), 150);
      return () => clearTimeout(id);
    }
  }, [open, value, kb, focusInside]);

  const openSearch = () => {
    setKb((k) => ({ open: k.open, seen: k.open }));
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  /** Mémorise une recherche réellement utilisée (validée ou suivie d'une ouverture). */
  const remember = useCallback(
    (q: string) => {
      const v = q.trim();
      if (!v || saved.current === v) return;
      saved.current = v;
      void fetch("/api/library/searches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: v.slice(0, 80) }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { recent?: string[] } | null) => d?.recent && setRecent(d.recent))
        .catch(() => undefined);
    },
    [],
  );

  const searching = query.trim().length > 0;
  const visible = useMemo(() => {
    if (!searching) return root ? rows.filter((r) => !r.folderId) : rows;
    return rows.filter((r) => matchesQuery(`${r.title} ${r.folderName ?? ""}`, query));
  }, [rows, root, query, searching]);
  const shownFolders = root ? (searching ? folders.filter((f) => matchesQuery(f.name, query)) : folders) : [];

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function startSelect(id: string) {
    setSelecting(true);
    setSelected(new Set([id]));
  }
  function endSelect() {
    setSelecting(false);
    setSelected(new Set());
  }

  const moveRows = rows.filter((r) => moveIds?.includes(r.id));

  return (
    <>
      <div className="lib-head">
        <h1>{title}</h1>
        <button
          type="button"
          className={`ib lib-search-toggle${searching ? " is-active" : ""}`}
          aria-expanded={open}
          aria-controls="lib-search"
          aria-label={searching ? `${t.library.searchOpen} — ${t.library.searchActive(query)}` : t.library.searchOpen}
          onClick={() => (open && !value.trim() ? setOpen(false) : openSearch())}
        >
          <Icon name="search" />
          {searching && <span className="lib-search-dot" aria-hidden="true" />}
        </button>
      </div>
      {headerExtra}

      {open && (
        <div
          id="lib-search"
          className="lib-search"
          onFocus={() => setFocusInside(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusInside(false);
          }}
        >
          <div className="searchbox" role="search">
            <Icon name="search" />
            <label htmlFor="lib-q" className="sr-only">{t.library.searchLabel}</label>
            <input
              ref={inputRef}
              id="lib-q"
              type="search"
              value={value}
              placeholder={t.library.search}
              maxLength={80}
              autoComplete="off"
              enterKeyHint="search"
              aria-describedby={searching ? "lib-scope" : undefined}
              onChange={(e) => setValue(e.target.value)}
              onCompositionStart={() => (composing.current = true)}
              onCompositionEnd={(e) => {
                composing.current = false;
                setValue((e.target as HTMLInputElement).value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setQuery(value);
                  remember(value);
                  inputRef.current?.blur();
                } else if (e.key === "Escape") {
                  setValue("");
                  setQuery("");
                  setOpen(false);
                }
              }}
            />
            {value && (
              <button
                type="button"
                className="ib searchbox-clear"
                aria-label={t.library.searchClear}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  setValue("");
                  setQuery("");
                  inputRef.current?.focus();
                }}
              >
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
          {!value && recent.length > 0 && (
            <div className="recent-searches">
              <p className="eyebrow" id="recent-h">{t.library.recentSearches}</p>
              <ul aria-labelledby="recent-h">
                {recent.map((r) => (
                  <li key={r}>
                    {/* Appliquée avant tout repli dû à la perte de focus. */}
                    <button
                      type="button"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setValue(r);
                        setQuery(r);
                        remember(r);
                      }}
                    >
                      <Icon name="clock" size={16} /> <span>{r}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn-link small"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  setRecent([]);
                  void fetch("/api/library/searches", { method: "DELETE" }).catch(() => undefined);
                }}
              >
                {t.library.clearRecent}
              </button>
            </div>
          )}
        </div>
      )}
      {searching && (
        <p id="lib-scope" className="active-search" role="status">
          <span>
            {t.library.results(visible.length + shownFolders.length, query.trim())} · {folder ? t.library.scopeFolder(folder.name) : t.library.scopeAll}
          </span>
        </p>
      )}

      {filters}

      {selecting && (
        <div className="lib-selbar" role="toolbar" aria-label={t.library.selectedCount(selected.size)}>
          <span className="lib-selbar-n" aria-live="polite">{t.library.selectedCount(selected.size)}</span>
          <button type="button" className="btn btn-primary" disabled={selected.size === 0} onClick={() => setMoveIds([...selected])}>
            <Icon name="move" /> {t.library.moveSelected}
          </button>
          <button type="button" className="btn" onClick={endSelect}>{t.library.cancelSelection}</button>
        </div>
      )}

      {root && !searching && (
        <section aria-labelledby="folders-h" className="lib-folders">
          <div className="lib-section-head">
            <SectionToggle id="folders-h" label={t.library.folders} count={shownFolders.length} open={!collapsed.has("folders")} onToggle={() => toggleSection("folders")} />
            {newFolder}
          </div>
          {shownFolders.length > 0 && !collapsed.has("folders") && (
            <ul className="rows" id="folders-h-list">
              {shownFolders.map((f) => (
                <li key={f.id}>
                  <Link href={`/?dossier=${f.id}`} className="row">
                    <span className="row-icon"><Icon name="folder" /></span>
                    <span className="row-text"><b>{f.name}</b><small>{t.library.folderCount(f.count)}</small></span>
                    <Icon name="chevron" className="row-chevron" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {root && searching && shownFolders.length > 0 && (
        <ul className="rows lib-folders">
          {shownFolders.map((f) => (
            <li key={f.id}>
              <Link href={`/?dossier=${f.id}`} className="row" onClick={() => remember(query)}>
                <span className="row-icon"><Icon name="folder" /></span>
                <span className="row-text"><b>{f.name}</b><small>{t.library.folderCount(f.count)}</small></span>
                <Icon name="chevron" className="row-chevron" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="limpids-h">
        {searching || selecting ? (
          <h2 id="limpids-h" className="eyebrow">{t.library.limpids}</h2>
        ) : (
          <SectionToggle id="limpids-h" label={t.library.limpids} count={visible.length} open={!collapsed.has("limpids")} onToggle={() => toggleSection("limpids")} />
        )}
        {!searching && !selecting && collapsed.has("limpids") ? null : visible.length === 0 ? (
          <p className="muted">{searching ? t.library.noResult : emptyText}</p>
        ) : (
          <ul className="rows lib-rows" id="limpids-h-list">
            {visible.map((r) => (
              <ReportRow
                key={r.id}
                row={searching ? r : { ...r, folderName: null }}
                showFailure={showFailure}
                selecting={selecting}
                selected={selected.has(r.id)}
                onToggle={toggle}
                onStartSelect={startSelect}
                onMove={(id) => setMoveIds([id])}
                onOpen={() => searching && remember(query)}
              />
            ))}
          </ul>
        )}
      </section>
      {selecting && <div className="lib-selbar-space" aria-hidden="true" />}
      {footer}

      <MovePanel
        open={!!moveIds}
        ids={moveIds ?? []}
        currentFolderIds={moveRows.map((r) => r.folderId)}
        folders={allFolders}
        onClose={() => setMoveIds(null)}
        onDone={() => {
          setMoveIds(null);
          endSelect();
        }}
      />
    </>
  );
}
