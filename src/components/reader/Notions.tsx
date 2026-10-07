"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import { termAnchor } from "@/lib/render/anchors";
import { pieceOf, useAnnex } from "./annex-link";
import { SourceRef } from "./Sources";

export interface Notion {
  /** Sens précis (V3) : deux chapitres peuvent employer le même mot dans deux sens. */
  key?: string;
  term: string;
  definition: string;
  /** V5 : exemple préproduit avec le cours (aucun appel IA au toucher). */
  example?: string | null;
  /** Références numérotées vers les extraits (définition sourcée dans le rapport). */
  refs: { n: number; evidenceId: string }[];
}

const Ctx = createContext<{ open: (term: string, opener: HTMLElement) => void; current: string | null }>({
  open: () => {},
  current: null,
});

/**
 * Notion en clair (kit V3, écran 08) : volet en bas d'écran sur mobile, panneau latéral sur
 * ordinateur. La position de lecture est préservée et le focus revient au mot à la fermeture.
 */
export function NotionsProvider({ notions, checkHref, children }: { notions: Notion[]; checkHref: string | null; children: React.ReactNode }) {
  const t = useT();
  const annex = useAnnex();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const notion = notions.find((n) => (n.key ?? n.term.toLowerCase()) === current?.toLowerCase());

  const open = useCallback((term: string, opener: HTMLElement) => {
    openerRef.current = opener;
    setCurrent(term);
    dialogRef.current?.showModal();
  }, []);

  return (
    <Ctx.Provider value={{ open, current }}>
      {children}
      <dialog
        ref={dialogRef}
        className="sheet side notion-sheet"
        aria-labelledby="notion-title"
        onClose={() => {
          setCurrent(null);
          openerRef.current?.focus();
        }}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2>{t.reader.notionTitle}</h2>
          <form method="dialog">
            <button className="ib" aria-label={t.reader.close}><Icon name="close" /></button>
          </form>
        </div>
        {notion && (
          <div className="stagger" key={notion.term}>
            <p className="eyebrow">{t.reader.inReport}</p>
            <h3 id="notion-title" className="notion-term">{notion.term}</h3>
            <p className="notion-def">{notion.definition}</p>
            {notion.example && (
              <p className="notion-example"><strong>{t.lim.example}</strong> {notion.example}</p>
            )}
            {notion.refs.length > 0 && (
              <p className="citation">
                <Icon name="file" /> {t.reader.source}
                {notion.refs.map((r) => <SourceRef key={r.evidenceId} n={r.n} evidenceId={r.evidenceId} />)}
              </p>
            )}
            {annex && (
              <a
                className="btn-link notion-glossary"
                href={annex.href(termAnchor(notion.key ?? notion.term))}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                  e.preventDefault();
                  annex.open(termAnchor(notion.key ?? notion.term), pieceOf(openerRef.current));
                }}
              >
                <Icon name="book" size={16} /> {t.reader.inGlossary}
              </a>
            )}
            {checkHref && (
              <form method="dialog">
                <button
                  className="btn btn-primary btn-block"
                  onClick={() => {
                    openerRef.current = null;
                    window.location.hash = checkHref;
                  }}
                >
                  <Icon name="quiz" /> {t.reader.checkUnderstanding}
                </button>
              </form>
            )}
          </div>
        )}
      </dialog>
    </Ctx.Provider>
  );
}

/** Mot souligné ouvrant l'explication locale. */
export function NotionTerm({ term, sense, children }: { term: string; sense?: string; children: React.ReactNode }) {
  const id = sense ?? term.toLowerCase();
  const t = useT();
  const { open, current } = useContext(Ctx);
  return (
    <button
      type="button"
      className="term"
      aria-haspopup="dialog"
      aria-expanded={current?.toLowerCase() === id}
      aria-label={t.reader.openNotion(term)}
      onClick={(e) => open(id, e.currentTarget)}
    >
      {children}
    </button>
  );
}
