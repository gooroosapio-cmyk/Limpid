"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import { isProjectionChoice, resolveProjection, type ProjectionChoice, type ProjectionStats } from "@/lib/reader/projection";

/** Pièce de premier niveau rattachée à un chapitre (cf. LimpidReader). */
interface Unit {
  el: HTMLElement;
  chapter: number;
  tail: boolean;
}

/** Texte initial visé par étape guidée (kit V3 : environ 140 mots). */
const STEP_WORDS = 140;

const storeKey = (reportId: string | null) => `limpid-projection:${reportId ?? "demo"}`;

/** Étapes du chapitre `i` : pièces regroupées jusqu'à ~140 mots, une figure compte pour 60. */
function stepsOf(all: Unit[], i: number): HTMLElement[][] {
  const groups: HTMLElement[][] = [];
  let cur: HTMLElement[] = [];
  let words = 0;
  for (const u of all) {
    if (u.chapter !== i || u.tail) continue;
    const w = u.el.matches(".piece-visual, figure, .piece-checkpoint") ? 60 : (u.el.textContent ?? "").split(/\s+/).filter(Boolean).length;
    if (cur.length && words + w > STEP_WORDS && !cur.every((el) => el.matches(".section-head, .v6-essential"))) {
      groups.push(cur);
      cur = [];
      words = 0;
    }
    cur.push(u.el);
    words += w;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/**
 * Projections du lecteur V3 (Livre, Guidé, Visuel, Auto) : mêmes pièces rendues par le serveur,
 * seule leur visibilité change (attributs `data-step-off`, `data-projection`). Aucun appel IA ;
 * le choix est gardé pour la session et l'ancre de lecture est conservée au changement.
 */
export function useProjection({
  enabled,
  stats,
  mode,
  reportId,
  colRef,
  deckRef,
  host,
  index,
  units,
  content,
}: {
  /** Contenu rendu (publication progressive) : réapplique la projection quand il change. */
  content: unknown;
  enabled: boolean;
  stats: ProjectionStats | null;
  mode: string | null;
  reportId: string | null;
  colRef: React.RefObject<HTMLDivElement | null>;
  deckRef: React.RefObject<HTMLDivElement | null>;
  host: HTMLElement | null;
  index: number;
  units: () => Unit[];
}) {
  const t = useT();
  const [choice, setChoiceState] = useState<ProjectionChoice>("auto");
  // État par chapitre : revient à la première étape (et replie l'explication) au changement.
  const [nav, setNav] = useState({ chapter: 0, step: 0, all: false, explain: false });
  const [count, setCount] = useState(0);
  const [hasPlain, setHasPlain] = useState(false);
  const pending = useRef<HTMLElement | null>(null);
  const on = enabled && !!stats;
  const { projection, reason } = on ? resolveProjection(choice, mode, stats) : { projection: "book" as const, reason: null };
  const cur = nav.chapter === index ? nav : { chapter: index, step: 0, all: false, explain: false };

  useEffect(() => {
    if (!on) return;
    try {
      const saved = sessionStorage.getItem(storeKey(reportId));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- préférence de session lue après le montage
      if (isProjectionChoice(saved)) setChoiceState(saved);
    } catch {}
  }, [on, reportId]);

  /** Applique la projection au DOM du chapitre `i` (étape active, paragraphes repliés). */
  const paint = useCallback(
    (i: number, state: typeof cur) => {
      const col = colRef.current;
      if (!col) return 0;
      col.dataset.projection = on ? projection : "";
      if (on && projection === "visual" && !state.explain) col.dataset.collapsed = "";
      else delete col.dataset.collapsed;
      const all = units();
      for (const u of all) u.el.removeAttribute("data-step-off");
      host?.removeAttribute("data-step-off");
      const steps = stepsOf(all, i);
      if (on && projection === "guided" && !state.all && steps.length > 1) {
        const step = Math.min(state.step, steps.length - 1);
        steps.forEach((g, k) => k !== step && g.forEach((el) => el.setAttribute("data-step-off", "")));
        if (step < steps.length - 1) host?.setAttribute("data-step-off", "");
      }
      return steps.length;
    },
    [colRef, on, projection, units, host],
  );

  const { step, all, explain } = cur;
  useEffect(() => {
    const n = paint(index, { chapter: index, step, all, explain });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- compte des étapes lu dans le DOM rendu
    setCount(n);
    setHasPlain(!!colRef.current?.querySelector('.lim > [data-plain]:not([data-chapter-off])'));
    const el = pending.current;
    if (el) {
      pending.current = null;
      requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
    }
  }, [paint, index, step, all, explain, content, colRef]);

  /** Rend visible un élément (ancre, notion, source) avant d'y défiler. */
  const reveal = useCallback(
    (el: Element) => {
      if (!on) return;
      const all = units();
      const unit = all.find((u) => u.el.contains(el));
      if (!unit) return;
      const next = { chapter: unit.chapter, step: 0, all: cur.all, explain: cur.explain || unit.el.hasAttribute("data-plain") };
      const steps = stepsOf(all, unit.chapter);
      next.step = Math.max(0, steps.findIndex((g) => g.includes(unit.el)));
      paint(unit.chapter, next);
      setNav(next);
    },
    [on, units, paint, cur.all, cur.explain],
  );

  /** Pièce en haut de l'écran : l'ancre conservée au changement de projection. */
  const topPiece = useCallback((): HTMLElement | null => {
    const deck = deckRef.current;
    if (!deck) return null;
    const line = deck.getBoundingClientRect().top + 8;
    let found: HTMLElement | null = null;
    for (const u of units()) {
      if (u.el.hasAttribute("data-chapter-off") || u.el.hasAttribute("data-step-off") || !u.el.offsetParent) continue;
      found ??= u.el;
      if (u.el.getBoundingClientRect().bottom > line) return u.el;
    }
    return found;
  }, [deckRef, units]);

  const setChoice = useCallback(
    (c: ProjectionChoice) => {
      const anchor = topPiece();
      try {
        sessionStorage.setItem(storeKey(reportId), c);
      } catch {}
      setChoiceState(c);
      if (!anchor) return;
      // Même ancre : l'étape guidée qui la contient devient active.
      const all = units();
      const unit = all.find((u) => u.el === anchor);
      const step = unit ? Math.max(0, stepsOf(all, unit.chapter).findIndex((g) => g.includes(anchor))) : 0;
      setNav({ chapter: unit?.chapter ?? index, step, all: false, explain: anchor.hasAttribute("data-plain") });
      pending.current = anchor;
    },
    [topPiece, reportId, units, index],
  );

  const go = (patch: Partial<typeof cur>) => {
    setNav({ ...cur, ...patch });
    requestAnimationFrame(() => {
      const deck = deckRef.current;
      if (deck) deck.scrollTop = 0;
    });
  };

  const bar =
    !on ? null : projection === "guided" && count > 1 ? (
      <nav className="proj-bar" aria-label={t.lim.proj.stepNav}>
        {cur.all ? (
          <button type="button" className="btn-link" onClick={() => go({ all: false })}>
            <Icon name="back" size={16} /> {t.lim.proj.backToStep}
          </button>
        ) : (
          <>
            <button type="button" className="btn" disabled={cur.step === 0} onClick={() => go({ step: cur.step - 1 })}>
              {t.lim.proj.prev}
            </button>
            <span className="proj-count" aria-live="polite">{t.lim.proj.stepOf(Math.min(cur.step, count - 1) + 1, count)}</span>
            {cur.step < count - 1 ? (
              <button type="button" className="btn btn-primary" onClick={() => go({ step: cur.step + 1 })}>
                {t.lim.proj.next}
              </button>
            ) : (
              <span className="proj-spacer" />
            )}
            <button type="button" className="btn-link proj-all" onClick={() => setNav({ ...cur, all: true })}>
              {t.lim.proj.seeAll}
            </button>
          </>
        )}
      </nav>
    ) : projection === "visual" && hasPlain ? (
      <nav className="proj-bar" aria-label={t.lim.proj.visualNav}>
        <button type="button" className="btn" aria-pressed={cur.explain} onClick={() => setNav({ ...cur, explain: !cur.explain })}>
          <Icon name={cur.explain ? "close" : "book"} size={16} /> {cur.explain ? t.lim.proj.hideExplanation : t.lim.proj.readExplanation}
        </button>
      </nav>
    ) : null;

  return { on, choice, setChoice, projection, reason, reveal, bar };
}

/** « Ma lecture » : choix local de l'approche, avec la raison du choix automatique. */
export function ProjectionPicker({
  choice,
  projection,
  reason,
  onChange,
}: {
  choice: ProjectionChoice;
  projection: string;
  reason: string | null;
  onChange: (c: ProjectionChoice) => void;
}) {
  const t = useT();
  const names = t.lim.proj.names as Record<string, string>;
  return (
    <div className="setting setting-projection">
      <span><b>{t.lim.proj.title}</b></span>
      <div className="seg" role="radiogroup" aria-label={t.lim.proj.title}>
        {(["auto", "book", "guided", "visual"] as const).map((c) => (
          <button key={c} type="button" role="radio" aria-checked={choice === c} onClick={() => onChange(c)}>
            {names[c]}
          </button>
        ))}
      </div>
      <p className="muted small">
        {choice === "auto" && reason ? (t.lim.proj.reasons as Record<string, string>)[reason] : t.lim.proj.chosen(names[projection] ?? projection)}
      </p>
    </div>
  );
}
