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

export type LibraryFilter = "tous" | "dossiers" | "prets" | "en_cours" | "favoris";
type View = "grid" | "list";

const VIEW_KEY = "limpid-library-view";
const HOME_FOLDERS = 4;
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
      <Link href={`/bibliotheque?dossier=${folder.id}`}>
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
 * Bibliothèque V4 : recherche visible, filtres (Tous, Prêts, En cours, Favoris) et tri séparés,
 * « À vérifier (n) », Reprendre, collections, puis Vos Limpid en cartes 4/3 ou en liste (choix
 * mémorisé, mêmes données et actions). Recherche instantanée sans réseau ni IA ; sélection
 * multiple et « Déplacer vers… » conservées.
 */
export function LibraryBrowser({
  title,
  folder,
  folders,
  allFolders,
  rows,
  root,
  filter,
  rail,
  sortControl,
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
  folder: { id: string; name: string } | null;
  folders: FolderItem[];
  allFolders: { id: string; name: string }[];
  rows: RowData[];
  root: boolean;
  filter: LibraryFilter;
  /** Filtres et tri (liens et sélecteur gardés dans l'adresse). */
  rail: React.ReactNode;
  /** Tri (Récents par défaut), affiché avec le choix Cartes / Liste. */
  sortControl?: React.ReactNode;
  resume: ResumeItem | null;
  /** Indicateur « À vérifier (n) », s'il y a des préparations interrompues. */
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
  const l = t.v4.library;
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
        <h1>{title}</h1>
      </div>
      {headerExtra}

      <div
        id="lib-search"
        className="lib-search"
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        <div className="searchbox" role="search">
          <Icon name="search" size={20} />
          <label htmlFor="lib-q" className="sr-only">{l.searchLabel}</label>
          <input
            ref={inputRef}
            id="lib-q"
            type="search"
            value={value}
            placeholder={l.search}
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
              }
            }}
          />
          {value && (
            <button
              type="button"
              className="icon-button searchbox-clear"
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
      {searching && (
        <p id="lib-scope" className="active-search" role="status">
          {t.library.results(visible.length + (showFolders ? shownFolders.length : 0), query.trim())} · {folder ? t.library.scopeFolder(folder.name) : t.library.scopeAll}
        </p>
      )}

      {!searching && rail}
      {!searching && preparations}

      {selecting && (
        <div className="lib-selbar" role="toolbar" aria-label={t.library.selectedCount(selected.size)}>
          <span className="lib-selbar-n" aria-live="polite">{t.library.selectedCount(selected.size)}</span>
          <button type="button" className="btn btn-primary" disabled={selected.size === 0} onClick={() => setMoveIds([...selected])}>
            <Icon name="move" /> {t.library.moveSelected}
          </button>
          <button type="button" className="btn" onClick={endSelect}>{t.library.cancelSelection}</button>
        </div>
      )}

      {!searching && resume && filter === "tous" && root && (
        <section className="lib-section" aria-labelledby="resume-h">
          <h2 id="resume-h">{v.resume}</h2>
          <div className="home-resume">
            <Cover cover={resume.cover} className="home-thumb" eager />
            <div className="home-resume-text">
              <b>{resume.title}</b>
              <small className="meta">{v.sources(resume.sourceCount)} · {v.opened(resume.opened)}</small>
            </div>
            <Link href={`/rapports/${resume.id}`} className="btn btn-primary home-resume-cta">{v.continue}</Link>
          </div>
        </section>
      )}

      {showFolders && (shownFolders.length > 0 || filter === "dossiers" || (root && !searching)) && (
        <section className="lib-section" aria-labelledby="folders-h">
          <div className="lib-section-head">
            <h2 id="folders-h">{l.collections}</h2>
            <div className="lib-section-tools">
              {filter === "tous" && !searching && folders.length > HOME_FOLDERS && (
                <Link href="/bibliotheque?filtre=dossiers" className="see-all">{l.seeAll} <Icon name="chevron" size={18} /></Link>
              )}
              {!searching && newFolder}
            </div>
          </div>
          {shownFolders.length === 0 ? (
            <p className="meta">{v.noFolders}</p>
          ) : (
            <ul className="folder-tiles">
              {(filter === "tous" && !searching ? shownFolders.slice(0, HOME_FOLDERS) : shownFolders).map((f) => (
                <FolderTile key={f.id} folder={f} />
              ))}
            </ul>
          )}
        </section>
      )}

      {showLessons && (
        <section className="lib-section" aria-labelledby="limpids-h">
          <div className="lib-section-head">
            <h2 id="limpids-h">{l.yourLimpids} <span className="meta">({visible.length})</span></h2>
            <div className="lib-view-tools">
            {sortControl}
            <div className="view-toggle" role="group" aria-label={l.viewLabel}>
              <button type="button" className="icon-button" aria-pressed={view === "grid"} aria-label={l.cards} onClick={() => chooseView("grid")}>
                <Icon name="grid" size={20} />
              </button>
              <button type="button" className="icon-button" aria-pressed={view === "list"} aria-label={l.list} onClick={() => chooseView("list")}>
                <Icon name="lines" size={20} />
              </button>
            </div>
            </div>
          </div>
          {visible.length === 0 ? (
            <p className="meta lib-empty-line">{searching ? t.library.noResult : emptyText}</p>
          ) : (
            <ul className={view === "grid" ? "limpid-grid" : "limpid-list"}>
              {visible.map((r) => (
                <ReportRow
                  key={r.id}
                  row={searching ? r : { ...r, folderName: null }}
                  variant={view}
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
