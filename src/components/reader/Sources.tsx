"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { fr } from "@/lib/i18n/fr";
import type { SourceEntry } from "@/lib/render/sources";


const Ctx = createContext<(evidenceId: string, opener: HTMLElement) => void>(() => {});

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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [current, setCurrent] = useState<SourceEntry | null>(null);

  const open = useCallback(
    (evidenceId: string, opener: HTMLElement) => {
      openerRef.current = opener;
      setCurrent(entries.find((e) => e.evidenceId === evidenceId) ?? null);
      dialogRef.current?.showModal();
    },
    [entries],
  );

  return (
    <Ctx.Provider value={open}>
      {children}
      <dialog
        ref={dialogRef}
        className="sheet side"
        aria-labelledby="source-title"
        onClose={() => openerRef.current?.focus()}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2>{fr.reader.source}</h2>
          <form method="dialog">
            <button className="ib" aria-label={fr.reader.close}><Icon name="close" /></button>
          </form>
        </div>
        {current && (
          <div className="stagger" key={current.evidenceId}>
            <p className="eyebrow">{fr.reader.sources} · [{current.n}]</p>
            <h3 id="source-title" className="source-sheet-title">{sourceTitle}</h3>
            <p className="muted">
              {fr.reader.location} : {current.location}
            </p>
            <blockquote className="quote">
              {current.before && <span className="muted">… {current.before} </span>}
              <mark>{current.quote}</mark>
              {current.after && <span className="muted"> {current.after} …</span>}
            </blockquote>
            {originalHref ? (
              <a className="btn btn-block" href={originalHref} target="_blank" rel="noopener noreferrer nofollow">
                <Icon name="file" /> {fr.reader.openOriginal}
              </a>
            ) : (
              <p className="notice">{fr.reader.originalMissing}</p>
            )}
          </div>
        )}
      </dialog>
    </Ctx.Provider>
  );
}

export function SourceRef({ n, evidenceId }: { n: number; evidenceId: string }) {
  const open = useContext(Ctx);
  return (
    <button
      type="button"
      className="ref"
      aria-haspopup="dialog"
      aria-label={fr.reader.seeSource(n)}
      onClick={(e) => open(evidenceId, e.currentTarget)}
    >
      {n}
    </button>
  );
}
