"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { AskPanel } from "@/components/reader/AskPanel";
import { useT } from "@/lib/i18n/client";
import { ancestorsOf, childrenIndex, layoutTree, LINE_H, PAD_Y, type PlacedNode } from "@/lib/supports/layout";
import type { MindMap, MindNode } from "@/lib/supports/mindmap";

interface Props {
  reportId: string;
  map: MindMap;
  glossary: { term: string; definition: string }[];
}

type View = { x: number; y: number; k: number };
const MIN_K = 0.45;
const MAX_K = 2.2;
const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

/**
 * Carte mentale interactive (§ 6) : vue d'ensemble compacte (cours → chapitres) puis vues par
 * chapitre, groupes dépliables, liens transversaux typés, recherche de notion, recentrage,
 * déplacement et zoom dans une zone dédiée (le défilement de la page reste libre ailleurs),
 * panneau de notion et vue en liste accessible. Dessin SVG ; aucune génération à l'usage.
 */
export function MindMapView({ reportId, map, glossary }: Props) {
  const t = useT();
  const m = t.supports.map;
  const [mode, setMode] = useState<"map" | "list">("map");
  const [rootId, setRootId] = useState("root");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["root"]));
  const [showLinks, setShowLinks] = useState(true);
  const [selected, setSelected] = useState<MindNode | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>({ x: 12, y: 12, k: 1 });
  const [asking, setAsking] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDialogElement>(null);
  const byId = useMemo(() => new Map(map.nodes.map((n) => [n.id, n])), [map]);
  const kids = useMemo(() => childrenIndex(map), [map]);
  const chapters = useMemo(() => map.nodes.filter((n) => n.kind === "chapitre"), [map]);
  const layout = useMemo(() => layoutTree(map, rootId, expanded), [map, rootId, expanded]);
  const placed = useMemo(() => new Map(layout.nodes.map((p) => [p.node.id, p])), [layout]);
  const definitions = useMemo(() => new Map(glossary.map((g) => [g.term.toLowerCase(), g.definition])), [glossary]);

  /** Ajuste l'échelle pour voir l'ensemble de la vue (largeur de la zone). */
  const fit = useCallback(() => {
    const el = areaRef.current;
    if (!el || !layout.width) return;
    const k = clampK(Math.min(1.1, (el.clientWidth - 24) / layout.width, (el.clientHeight - 24) / Math.max(layout.height, 1)));
    setView({ k, x: 12, y: Math.max(12, (el.clientHeight - layout.height * k) / 2) });
  }, [layout.width, layout.height]);
  // Recadrage au changement de vue seulement (déplier un groupe garde l'échelle et la position).
  const fitRef = useRef(fit);
  useEffect(() => {
    fitRef.current = fit;
  }, [fit]);
  useEffect(() => fitRef.current(), [rootId, mode]);

  /** Centre la zone sur un nœud déjà placé. */
  const centerOn = useCallback((id: string) => {
    const el = areaRef.current;
    const p = placed.get(id);
    if (!el || !p) return;
    setView((v) => ({ ...v, x: el.clientWidth / 2 - (p.x + p.w / 2) * v.k, y: el.clientHeight / 2 - (p.y + p.h / 2) * v.k }));
  }, [placed]);

  const openNode = (n: MindNode) => {
    setSelected(n);
    setAsking(false);
    panel.current?.showModal();
  };
  const [focusId, setFocusId] = useState<string | null>(null);
  const toggle = (id: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setFocusId(id);
  };
  // Groupe déplié : il passe à gauche de la zone, ses enfants visibles à droite.
  useEffect(() => {
    if (!focusId) return;
    const el = areaRef.current;
    const p = placed.get(focusId);
    if (!el || !p) return;
     
    setView((v) => ({ ...v, x: 16 - p.x * v.k, y: el.clientHeight / 2 - (p.y + p.h / 2) * v.k }));
    setFocusId(null);
  }, [focusId, placed]);
  const chooseRoot = (id: string) => {
    setRootId(id);
    // Vue d'un chapitre : tous ses groupes ouverts ; vue d'ensemble : cours et chapitres.
    setExpanded(id === "root" ? new Set(["root"]) : new Set(map.nodes.filter((n) => n.id === id || ancestorsOf(map, n.id).includes(id)).map((n) => n.id)));
  };
  /** Recherche : la notion devient visible (ancêtres dépliés), centrée, puis son panneau s'ouvre. */
  const reach = (n: MindNode) => {
    const up = ancestorsOf(map, n.id);
    if (rootId !== "root" && !up.includes(rootId) && n.id !== rootId) setRootId("root");
    setExpanded((s) => new Set([...s, ...up]));
    setQuery("");
    requestAnimationFrame(() => requestAnimationFrame(() => centerOn(n.id)));
    openNode(n);
  };

  const q = query.trim().toLowerCase();
  const matches = q.length >= 2 ? map.nodes.filter((n) => n.kind !== "racine" && `${n.label} ${n.detail ?? ""} ${n.concept_term ?? ""}`.toLowerCase().includes(q)).slice(0, 8) : [];

  // ---------- Déplacement et zoom (zone dédiée seulement) ----------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; k: number; mid: { x: number; y: number }; view: View } | null>(null);
  const moved = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), k: view.k, mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 }, view };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const g = gesture.current;
      const k = clampK((g.k * Math.hypot(a!.x - b!.x, a!.y - b!.y)) / Math.max(g.dist, 1));
      const rect = areaRef.current!.getBoundingClientRect();
      const mx = g.mid.x - rect.left;
      const my = g.mid.y - rect.top;
      setView({ k, x: mx - ((mx - g.view.x) * k) / g.view.k, y: my - ((my - g.view.y) * k) / g.view.k });
      moved.current = true;
      return;
    }
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
    if (moved.current) {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId) === false) e.currentTarget.setPointerCapture?.(e.pointerId);
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  };
  const zoomBy = (f: number) => {
    const el = areaRef.current;
    if (!el) return;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    setView((v) => {
      const k = clampK(v.k * f);
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  };
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    // Molette (ordinateur) : zoom dans la zone seulement, sans faire défiler la page.
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView((v) => {
        const k = clampK(v.k * (e.deltaY < 0 ? 1.1 : 0.9));
        return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [mode]);

  const nodeTap = (p: PlacedNode) => {
    if (moved.current) return;
    openNode(p.node);
  };

  const sel = selected;
  const selKids = sel ? kids.get(sel.id) ?? [] : [];
  const outgoing = sel ? map.edges.filter((e) => e.from === sel.id) : [];
  const incoming = sel ? map.edges.filter((e) => e.to === sel.id) : [];
  const definition = sel?.concept_term ? definitions.get(sel.concept_term.toLowerCase()) ?? null : null;
  const chapterOfSel = sel?.chapter_id ?? null;
  const chapterTitle = chapterOfSel ? byId.get(`ch:${chapterOfSel}`)?.label ?? "" : "";

  return (
    <section className="mm" aria-labelledby="mm-h">
      <h2 id="mm-h" className="sr-only">{m.title}</h2>
      <div className="mm-tools">
        <label className="mm-select">
          <span className="sr-only">{m.view}</span>
          <select value={rootId} onChange={(e) => chooseRoot(e.target.value)}>
            <option value="root">{m.overview}</option>
            {chapters.map((c, i) => (
              <option key={c.id} value={c.id}>{`${i + 1}. ${c.detail ?? c.label}`}</option>
            ))}
          </select>
          <Icon name="chevron" size={16} className="mm-select-caret" />
        </label>
        <div className="seg mm-mode" role="group" aria-label={m.view}>
          <button type="button" aria-pressed={mode === "map"} onClick={() => setMode("map")}><Icon name="mindmap" size={16} /> {m.asMap}</button>
          <button type="button" aria-pressed={mode === "list"} onClick={() => setMode("list")}><Icon name="list" size={16} /> {m.asList}</button>
        </div>
      </div>
      <div className="mm-search">
        <Icon name="search" size={18} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={m.search} aria-label={m.search} />
      </div>
      {q.length >= 2 && (
        <ul className="mm-matches" aria-live="polite">
          {matches.length ? (
            matches.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => reach(n)}>
                  <span className={`mm-dot mm-c-${n.color}`} aria-hidden="true" />
                  {n.label}
                </button>
              </li>
            ))
          ) : (
            <li className="muted">{m.noMatch}</li>
          )}
        </ul>
      )}

      {mode === "map" ? (
        <>
          <div
            ref={areaRef}
            className="mm-area"
            role="application"
            aria-label={m.areaLabel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <svg className="mm-svg" width="100%" height="100%" aria-hidden="false">
              <defs>
                <marker id="mm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" className="mm-arrow" />
                </marker>
              </defs>
              <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
                {layout.links.map((l) => {
                  const a = placed.get(l.from)!;
                  const b = placed.get(l.to)!;
                  const x1 = a.x + a.w;
                  const y1 = a.y + a.h / 2;
                  const x2 = b.x;
                  const y2 = b.y + b.h / 2;
                  const mx = (x1 + x2) / 2;
                  return <path key={`${l.from}-${l.to}`} d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} className={`mm-link mm-s-${b.node.color}`} />;
                })}
                {showLinks &&
                  map.edges.map((e) => {
                    const a = placed.get(e.from);
                    const b = placed.get(e.to);
                    if (!a || !b) return null;
                    const x1 = a.x + a.w / 2;
                    const y1 = a.y + (b.y > a.y ? a.h : 0);
                    const x2 = b.x + b.w / 2;
                    const y2 = b.y + (b.y > a.y ? 0 : b.h);
                    const bend = Math.max(30, Math.abs(y2 - y1) / 3);
                    const cx = Math.max(x1, x2) + bend;
                    const label = e.label ?? m.relations[e.relation] ?? e.relation;
                    return (
                      <g key={e.id} className="mm-edge">
                        <path d={`M ${x1} ${y1} Q ${cx} ${(y1 + y2) / 2} ${x2} ${y2}`} markerEnd="url(#mm-arrow)" />
                        <text x={(x1 + x2) / 2 + bend / 2} y={(y1 + y2) / 2} className="mm-edge-label">{label}</text>
                      </g>
                    );
                  })}
                {layout.nodes.map((p) => (
                  <g key={p.node.id} className={`mm-node mm-k-${p.node.kind}${sel?.id === p.node.id ? " is-selected" : ""}`}>
                    <g
                      role="button"
                      tabIndex={0}
                      aria-label={p.node.detail ? `${p.node.label} — ${p.node.detail}` : p.node.label}
                      onClick={() => nodeTap(p)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openNode(p.node);
                        }
                      }}
                    >
                      <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={10} className={`mm-box mm-c-${p.node.color}`} />
                      <text x={p.x + 10} y={p.y + PAD_Y / 2 + LINE_H - 3} className="mm-label">
                        {p.lines.map((line, i) => (
                          <tspan key={i} x={p.x + 10} dy={i === 0 ? 0 : LINE_H}>{line}</tspan>
                        ))}
                      </text>
                    </g>
                    {p.hasChildren && (
                      <g
                        role="button"
                        tabIndex={0}
                        className="mm-toggle"
                        aria-label={p.hidden ? m.expand(p.hidden) : m.collapse}
                        aria-expanded={!p.hidden}
                        onClick={() => !moved.current && toggle(p.node.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggle(p.node.id);
                          }
                        }}
                      >
                        <circle cx={p.x + p.w} cy={p.y + p.h / 2} r={22} className="mm-toggle-hit" />
                        <circle cx={p.x + p.w} cy={p.y + p.h / 2} r={11} className="mm-toggle-dot" />
                        <text x={p.x + p.w} y={p.y + p.h / 2 + 4} className="mm-toggle-txt">{p.hidden ? (p.hidden > 9 ? "9+" : `+${p.hidden}`) : "−"}</text>
                      </g>
                    )}
                  </g>
                ))}
              </g>
            </svg>
            <div className="mm-zoom">
              <button type="button" className="ib" aria-label={m.zoomIn} onClick={() => zoomBy(1.2)}><Icon name="plus" size={18} /></button>
              <button type="button" className="ib" aria-label={m.zoomOut} onClick={() => zoomBy(1 / 1.2)}><span aria-hidden="true">−</span></button>
              <button type="button" className="ib" aria-label={m.recenter} onClick={fit}><Icon name="target" size={18} /></button>
            </div>
          </div>
          <div className="mm-foot">
            <label className="mm-links-toggle">
              <input type="checkbox" checked={showLinks} onChange={(e) => setShowLinks(e.target.checked)} /> {m.links}
            </label>
            <p className="muted small">{m.hint}</p>
          </div>
        </>
      ) : (
        <MapList map={map} rootId={rootId} onOpen={openNode} />
      )}

      <dialog ref={panel} className="sheet side mm-panel" aria-labelledby="mm-panel-h" onClose={() => setAsking(false)}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id="mm-panel-h">{sel?.label ?? ""}</h2>
          <form method="dialog">
            <button className="ib" aria-label={t.reader.close}><Icon name="close" /></button>
          </form>
        </div>
        {sel && (
          <div className={`mm-panel-body mm-c-${sel.color}`}>
            {chapterTitle && sel.kind !== "chapitre" && <p className="eyebrow">{chapterTitle}</p>}
            {sel.detail && <p>{sel.detail}</p>}
            {definition && (
              <p className="mm-def"><strong>{m.definition} :</strong> {definition}</p>
            )}
            {(outgoing.length > 0 || incoming.length > 0) && (
              <ul className="mm-rel">
                {outgoing.map((e) => (
                  <li key={e.id}>
                    <span className="mm-rel-kind">{m.relations[e.relation]}</span>{" "}
                    <button type="button" className="btn-link" onClick={() => reach(byId.get(e.to)!)}>{byId.get(e.to)?.label}</button>
                  </li>
                ))}
                {incoming.map((e) => (
                  <li key={e.id}>
                    <button type="button" className="btn-link" onClick={() => reach(byId.get(e.from)!)}>{byId.get(e.from)?.label}</button>{" "}
                    <span className="mm-rel-kind">{m.relations[e.relation]}</span>
                  </li>
                ))}
              </ul>
            )}
            {selKids.length > 0 && (
              <button type="button" className="btn btn-block" onClick={() => toggle(sel.id)}>
                {expanded.has(sel.id) ? m.collapse : m.expand(selKids.length)}
              </button>
            )}
            {sel.evidence_ids.length > 0 && <p className="muted small"><Icon name="source" size={14} /> {m.sources(sel.evidence_ids.length)}</p>}
            <div className="mm-panel-actions">
              {chapterOfSel && (
                <Link href={`/rapports/${reportId}?a=${encodeURIComponent(chapterOfSel)}`} className="btn btn-primary">
                  <Icon name="book" size={18} /> {m.inCourse}
                </Link>
              )}
              <button type="button" className="btn" onClick={() => setAsking((a) => !a)} aria-expanded={asking}>
                <Icon name="chat" size={18} /> {m.askAbout}
              </button>
            </div>
            {asking && (
              <AskPanel
                reportId={reportId}
                section={chapterOfSel ? { id: chapterOfSel, title: chapterTitle } : null}
                initialQuestion={m.askPrompt(sel.concept_term ?? sel.label)}
              />
            )}
          </div>
        )}
      </dialog>
    </section>
  );
}

/** Vue en liste : arborescence complète, dépliable, utilisable au clavier et au lecteur d'écran. */
function MapList({ map, rootId, onOpen }: { map: MindMap; rootId: string; onOpen: (n: MindNode) => void }) {
  const t = useT();
  const kids = useMemo(() => childrenIndex(map), [map]);
  const root = map.nodes.find((n) => n.id === rootId);
  const rel = (n: MindNode) => map.edges.filter((e) => e.from === n.id);
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const item = (n: MindNode, depth: number): React.ReactNode => {
    const children = kids.get(n.id) ?? [];
    const head = (
      <button type="button" className="mm-li-btn" onClick={() => onOpen(n)}>
        <span className={`mm-dot mm-c-${n.color}`} aria-hidden="true" />
        <span>{n.label}</span>
      </button>
    );
    const links = rel(n);
    const linkList = links.length > 0 && (
      <ul className="mm-li-links">
        {links.map((e) => (
          <li key={e.id}>→ {t.supports.map.relations[e.relation]} {byId.get(e.to)?.label}</li>
        ))}
      </ul>
    );
    if (!children.length) return <li key={n.id}>{head}{linkList}</li>;
    return (
      <li key={n.id}>
        <details open={depth < 1}>
          <summary>{n.label} <span className="muted">({children.length})</span></summary>
          {head}
          {linkList}
          <ul>{children.map((c) => item(c, depth + 1))}</ul>
        </details>
      </li>
    );
  };
  if (!root) return null;
  return <ul className="mm-list">{item(root, 0)}</ul>;
}
