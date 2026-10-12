"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import type { SourceEntry } from "@/lib/render/sources";
import { pieceOf, useAnnex } from "./annex-link";


const Ctx = createContext<(evidenceId: string | string[], opener: HTMLElement) => void>(() => {});

/** Panneau des sources : bas d'écran sur mobile, focus restauré à la fermeture (PDF p. 7). */
export function SourcesProvider({
  entries,
  sourceTitle,
  originalHref = null,
  children,
}: {
  entries: SourceEntry[];
  sourceTitle: string;
  /** Original consultable ; absent = « Original indisponible » (jamais de faux lien). */
  originalHref?: string | null;
  children: React.ReactNode;
}) {
  const t = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [current, setCurrent] = useState<SourceEntry[]>([]);

  const open = useCallback(
    (evidenceId: string | string[], opener: HTMLElement) => {
      openerRef.current = opener;
      const ids = Array.isArray(evidenceId) ? evidenceId : [evidenceId];
      setCurrent(entries.filter((e) => ids.includes(e.evidenceId)).sort((a, b) => a.n - b.n));
      dialogRef.current?.showModal();
    },
    [entries],
  );

  return (
    <Ctx.Provider value={open}>
      {children}
      <dialog
        ref={dialogRef}
        className="sheet side source-sheet"
        aria-labelledby="source-title"
        data-swipe-close=""
        onClose={() => openerRef.current?.focus()}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2>{t.reader.source}</h2>
          <form method="dialog">
            <button className="ib" aria-label={t.reader.close}><Icon name="close" /></button>
          </form>
        </div>
        <div className="source-sheet-body" key={current.map((c) => c.evidenceId).join(",")}>
          <p id="source-title" className="source-sheet-title">{sourceTitle}</p>
          {current.map((c) => (
            <section key={c.evidenceId} className="source-item">
              <p className="muted source-loc">{t.reader.location} : {c.location}</p>
              <blockquote className="quote">
                {c.before && <span className="muted">… {c.before} </span>}
                <mark>{c.quote}</mark>
                {c.after && <span className="muted"> {c.after} …</span>}
              </blockquote>
            </section>
          ))}
          {current.length > 0 &&
            (originalHref ? (
              <a className="btn btn-block" href={originalHref} target="_blank" rel="noopener noreferrer nofollow">
                <Icon name="file" /> {t.reader.openOriginal}
              </a>
            ) : (
              <p className="notice">{t.reader.originalMissing}</p>
            ))}
        </div>
      </dialog>
    </Ctx.Provider>
  );
}

/**
 * Indice de référence discret (V5, § 14) : dans le lecteur, il ouvre la page Annexes à la
 * source citée (document, page, extrait, original) ; ailleurs, le panneau des sources.
 */
export function SourceRef({ n, evidenceId }: { n: number; evidenceId: string }) {
  const t = useT();
  const open = useContext(Ctx);
  const annex = useAnnex();
  if (annex)
    return (
      <a
        className="ref"
        href={annex.href(`src-${n}`)}
        aria-label={t.reader.seeSource(n)}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
          e.preventDefault();
          annex.open(`src-${n}`, pieceOf(e.currentTarget));
        }}
      >
        {n}
      </a>
    );
  return (
    <button
      type="button"
      className="ref"
      aria-haspopup="dialog"
      aria-label={t.reader.seeSource(n)}
      onClick={(e) => open(evidenceId, e.currentTarget)}
    >
      {n}
    </button>
  );
}

/**
 * Renvoi aux sources (retour lecteur) : un mot du passage est surligné ; le toucher ouvre une
 * petite fenêtre avec l'extrait du document. Elle se ferme d'un glissement vers le bas.
 */
export function SourceMark({ ids, children }: { ids: string[]; children: React.ReactNode }) {
  const t = useT();
  const open = useContext(Ctx);
  return (
    <button type="button" className="src-mark" aria-haspopup="dialog" aria-label={`${typeof children === "string" ? children : ""} — ${t.reader.source}`} onClick={(e) => open(ids, e.currentTarget)}>
      {children}
    </button>
  );
}

/** Renvoi sans mot d'ancrage sûr : petite pastille « source » discrète. */
export function SourceChip({ ids }: { ids: string[] }) {
  const t = useT();
  const open = useContext(Ctx);
  return (
    <button type="button" className="src-chip" aria-haspopup="dialog" aria-label={t.reader.source} onClick={(e) => open(ids, e.currentTarget)}>
      <Icon name="source" size={14} />
    </button>
  );
}
