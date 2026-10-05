"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import { matchesQuery } from "@/lib/library/search";
import type { CoverView } from "@/lib/library/covers";
import { Cover } from "./Cover";
import { MovePanel } from "./MovePanel";
import { ReportRow, type RowData } from "./ReportRow";

export interface FolderItem {
  id: string;
  name: string;
  count: number;
  cover: CoverView;
}

export interface ResumeItem {
  id: string;
  title: string;
  cover: CoverView;
  sourceCount: number;
  opened: string;
}

export type LibraryFilter = "tous" | "recents" | "dossiers" | "prets" | "favoris";
type View = "grid" | "list";

const VIEW_KEY = "limpid-library-view";
const HOME_COUNT = 4;
const DEBOUNCE_MS = 250;

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

/** Tuile de dossier (FolderTile) : petite, horizontale, avec sa couverture en filigrane. */
export function FolderTile({ folder }: { folder: FolderItem }) {
  const t = useT();
  return (
    <li className="folder-tile">
      <Link href={`/?dossier=${folder.id}`}>
        <Cover cover={folder.cover} className="folder-tile-cover" />
        <span className="folder-tile-icon"><Icon name="folder" /></span>
        <span className="folder-tile-text">
          <b>{folder.name}</b>
          <small>{t.library.v2.items(folder.count)}</small>
        </span>
        <Icon name="chevron" className="folder-tile-chevron" />
      </Link>
    </li>
  );
}

/**
 * Bibliothèque V2 (galerie) : recherche visible, rail de filtres, Reprendre, collections et
 * leçons en grille 4:5 ou en liste (choix mémorisé). Recherche instantanée sans réseau ni IA ;
 * sélection multiple et « Déplacer vers… » conservées.
 */
export function LibraryBrowser({
  title,
  subtitle,
  folder,
  folders,
  allFolders,
  rows,
  root,
  filter,
  rail,
  resume,
  preparations,
  headerExtra,
  footer,
  emptyText,
  recent: initialRecent,
  initialQuery,
  newFolder,
}: {
  title: string;
  subtitle: string | null;
  folder: { id: string; name: string } | null;
  folders: FolderItem[];
  allFolders: { id: string; name: string }[];
  rows: RowData[];
  root: boolean;
  filter: LibraryFilter;
  rail: React.ReactNode;
  resume: ResumeItem | null;
  /** Lien vers les préparations (en cours, à vérifier), si elles existent. */
  preparations: React.ReactNode;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  emptyText: string;
  recent: string[];
  initialQuery: string;
  newFolder: React.ReactNode;
}) {
  const t = useT();
  const v = t.library.v2;
  // Recherche rétractable : la loupe à droite du titre ouvre le champ.
  const [open, setOpen] = useState(!!initialQuery);
  const [value, setValue] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState(initialRecent);
  const [view, setView] = useState<View>("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const saved = useRef("");

  // Affichage grille / liste : préférence de l'appareil, relue après l'hydratation.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- stockage de l'appareil, lu après l'hydratation
  useEffect(() => setView(readView()), []);
  const chooseView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Navigation privée : le choix vaut pour la visite.
    }
  };

  // Requête appliquée 250 ms après la dernière frappe (pas pendant une composition).
  useEffect(() => {
    if (composing.current) return;
    const id = setTimeout(() => setQuery(value), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [value]);

  // La requête est gardée dans l'adresse : le retour depuis une leçon la restaure.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("q", query.trim());
    else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [query]);

  /** Mémorise une recherche réellement utilisée (validée ou suivie d'une ouverture). */
  const remember = useCallback((q: string) => {
    const s = q.trim();
    if (!s || saved.current === s) return;
    saved.current = s;
    void fetch("/api/library/searches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: s.slice(0, 80) }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { recent?: string[] } | null) => d?.recent && setRecent(d.recent))
      .catch(() => undefined);
  }, []);

  const searching = query.trim().length > 0;
  const visible = useMemo(() => {
    if (!searching) return rows;
    return rows.filter((r) => matchesQuery(`${r.title} ${r.folderName ?? ""}`, query));
  }, [rows, query, searching]);
  const shownFolders = searching ? folders.filter((f) => matchesQuery(f.name, query)) : folders;
  const showFolders = root && (filter === "tous" || filter === "dossiers" || searching);
  const showLessons = filter !== "dossiers" || searching;
  // Accueil (« Tous ») : quelques leçons et « Tout voir » ; les autres filtres montrent tout.
  const home = filter === "tous" && root && !searching && !selecting;

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const startSelect = (id: string) => {
    setSelecting(true);
    setSelected(new Set([id]));
  };
  const endSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const moveRows = rows.filter((r) => moveIds?.includes(r.id));

  return (
    <>
      <div className="lib-titlebar">
        <div className="page-title lib-title">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          type="button"
          className={`ib lib-search-toggle${searching ? " is-active" : ""}`}
          aria-expanded={open}
          aria-controls="lib-search"
          aria-label={searching ? `${t.library.searchOpen} — ${t.library.searchActive(query)}` : t.library.searchOpen}
          onClick={() => {
            if (open && !value.trim()) return setOpen(false);
            setOpen(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <Icon name="search" size={26} />
          {searching && <span className="bell-dot" aria-hidden="true" />}
        </button>
      </div>
      {headerExtra}

      {open && (
      <div
        id="lib-search"
        className="lib-search"
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setFocused(false);
            // Champ vide quitté : la recherche se replie.
            if (!value.trim()) setOpen(false);
          }
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
        {focused && !value && recent.length > 0 && (
          <div className="recent-searches">
            <p className="eyebrow" id="recent-h">{t.library.recentSearches}</p>
            <ul aria-labelledby="recent-h">
              {recent.map((r) => (
                <li key={r}>
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setValue(r);
                      setQuery(r);
                      remember(r);
                    }}
                  >
                    <Icon name="clock" size={18} /> <span>{r}</span>
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
          {t.library.results(visible.length + (showFolders ? shownFolders.length : 0), query.trim())} · {folder ? t.library.scopeFolder(folder.name) : t.library.scopeAll}
        </p>
      )}

      {!searching && rail}

      {selecting && (
        <div className="lib-selbar" role="toolbar" aria-label={t.library.selectedCount(selected.size)}>
          <span className="lib-selbar-n" aria-live="polite">{t.library.selectedCount(selected.size)}</span>
          <button type="button" className="btn btn-primary" disabled={selected.size === 0} onClick={() => setMoveIds([...selected])}>
            <Icon name="move" /> {t.library.moveSelected}
          </button>
          <button type="button" className="btn" onClick={endSelect}>{t.library.cancelSelection}</button>
        </div>
      )}

      {!searching && preparations}

      {!searching && resume && filter === "tous" && root && (
        <section className="resume" aria-labelledby="resume-h">
          <Cover cover={resume.cover} className="resume-cover" eager />
          <div className="resume-body">
            <p className="resume-eyebrow">{v.resume}</p>
            <h2 id="resume-h">{resume.title}</h2>
            <p className="resume-meta">
              <Icon name="layers" size={18} /> {v.sources(resume.sourceCount)} · {v.opened(resume.opened)}
            </p>
          </div>
          <Link href={`/rapports/${resume.id}`} className="btn btn-primary resume-cta">
            {v.continue} <Icon name="arrow" />
          </Link>
        </section>
      )}

      {showFolders && (shownFolders.length > 0 || filter === "dossiers") && (
        <section aria-labelledby="folders-h">
          <div className="section-head">
            <h2 id="folders-h">{v.collections}</h2>
            {filter === "tous" && !searching && folders.length > 2 ? (
              <Link href="/?filtre=dossiers">{v.seeAll} <Icon name="chevron" /></Link>
            ) : (
              !searching && newFolder
            )}
          </div>
          {shownFolders.length === 0 ? (
            <p className="muted">{v.noFolders}</p>
          ) : (
            <ul className="folder-tiles">
              {(filter === "tous" && !searching ? shownFolders.slice(0, 2) : shownFolders).map((f) => (
                <FolderTile key={f.id} folder={f} />
              ))}
            </ul>
          )}
        </section>
      )}

      {showLessons && (
        <section aria-labelledby="limpids-h">
          {home ? (
            <div className="section-head">
              <h2 id="limpids-h">{v.yourLimpids}</h2>
              {visible.length > HOME_COUNT && <Link href="/?filtre=prets">{v.seeAll} <Icon name="chevron" /></Link>}
            </div>
          ) : (
            <div className="section-head lib-count">
              <p id="limpids-h">{filter === "prets" ? v.readyCount(visible.length) : v.count(visible.length)}</p>
              <div className="view-toggle" role="group" aria-label={v.yourLimpids}>
                <button type="button" className="ib" aria-pressed={view === "grid"} aria-label={v.viewGrid} onClick={() => chooseView("grid")}>
                  <Icon name="grid" />
                </button>
                <button type="button" className="ib" aria-pressed={view === "list"} aria-label={v.viewList} onClick={() => chooseView("list")}>
                  <Icon name="lines" />
                </button>
              </div>
            </div>
          )}
          {visible.length === 0 ? (
            <p className="muted">{searching ? t.library.noResult : emptyText}</p>
          ) : (
            <ul className={home || view === "grid" ? `lesson-grid${home ? " lesson-grid-home" : ""}` : "lesson-list"}>
              {(home ? visible.slice(0, HOME_COUNT) : visible).map((r) => (
                <ReportRow
                  key={r.id}
                  row={searching ? r : { ...r, folderName: null }}
                  variant={home ? "grid" : view}
                  showFavorite={!home}
                  sourcesFirst={home}
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
      )}
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
