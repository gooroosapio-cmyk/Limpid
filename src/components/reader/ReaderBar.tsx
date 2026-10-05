"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { fr } from "@/lib/i18n/fr";

/**
 * Barre de lecture (kit V3, écran 07) : sommaire, révision et « Demander » (passe suivante :
 * bouton présent, désactivé, avec une explication).
 */
export function ReaderBar({ toc, hasChecks }: { toc: { id: string; question: string }[]; hasChecks: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [toast, setToast] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Position de lecture : la partie visible est signalée dans le sommaire.
  useEffect(() => {
    const els = toc.map((t) => document.getElementById(t.id)).filter((e): e is HTMLElement => !!e);
    if (els.length === 0 || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [toc]);

  return (
    <>
      <nav className="readerbar" aria-label={fr.reader.toc}>
        <button type="button" className="subtle" aria-haspopup="dialog" onClick={() => dialogRef.current?.showModal()}>
          <Icon name="list" /> <span className="sr-only">{fr.reader.toc}</span>
        </button>
        {hasChecks && (
          <a href="#verifier" className="subtle">
            <Icon name="quiz" /> {fr.reader.testMe}
          </a>
        )}
        <button type="button" className="ask" aria-disabled="true" aria-describedby="ask-soon" onClick={() => setToast(true)}>
          <Icon name="chat" /> {fr.reader.ask}
          <span className="soon-tag">{fr.reader.soon}</span>
        </button>
        <span id="ask-soon" className="sr-only">{fr.reader.askSoon}</span>
      </nav>
      {toast && <p className="toast toast-reader" role="status">{fr.reader.askSoon}</p>}

      <dialog ref={dialogRef} className="sheet side" aria-labelledby="toc-sheet-title">
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id="toc-sheet-title">{fr.reader.inThisReport}</h2>
          <form method="dialog">
            <button className="ib" aria-label={fr.reader.close}><Icon name="close" /></button>
          </form>
        </div>
        <p className="muted small">{fr.reader.tocHint}</p>
        <nav className="toc" aria-labelledby="toc-sheet-title">
          <ol>
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} aria-current={active === t.id ? "location" : undefined} onClick={() => dialogRef.current?.close()}>
                  {t.question}
                </a>
              </li>
            ))}
            {hasChecks && (
              <li className="toc-check">
                <a href="#verifier" onClick={() => dialogRef.current?.close()}>{fr.reader.check}</a>
              </li>
            )}
          </ol>
        </nav>
      </dialog>
    </>
  );
}
