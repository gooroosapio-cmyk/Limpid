"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { fr } from "@/lib/i18n/fr";

export interface SourceEntry {
  n: number;
  evidenceId: string;
  location: string;
  before: string;
  quote: string;
  after: string;
}

const Ctx = createContext<(evidenceId: string, opener: HTMLElement) => void>(() => {});

/** Panneau des sources : bas d'écran sur mobile, focus restauré à la fermeture (PDF p. 7). */
export function SourcesProvider({
  entries,
  sourceTitle,
  children,
}: {
  entries: SourceEntry[];
  sourceTitle: string;
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
        className="sheet"
        aria-labelledby="source-title"
        onClose={() => openerRef.current?.focus()}
      >
        {current && (
          <>
            <p className="eyebrow">{fr.reader.sources} · [{current.n}]</p>
            <h2 id="source-title">{sourceTitle}</h2>
            <p className="muted">
              {fr.reader.location} : {current.location}
            </p>
            <blockquote className="quote">
              {current.before && <span className="muted">… {current.before} </span>}
              <mark>{current.quote}</mark>
              {current.after && <span className="muted"> {current.after} …</span>}
            </blockquote>
          </>
        )}
        <form method="dialog">
          <button className="btn btn-block" autoFocus>
            {fr.reader.close}
          </button>
        </form>
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
