"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import { AskPanel } from "./AskPanel";
import { QuizRunner } from "./QuizRunner";

type Sheet = "toc" | "test" | "ask" | null;

/**
 * Barre de lecture (kit V3, écran 07) : Sommaire (et options du rapport), Me tester
 * (Interrogation sur la partie en cours ou Devoir sur tout le document) et Poser une question.
 */
export function ReaderBar({
  toc,
  hasChecks,
  reportId,
  options,
}: {
  toc: { id: string; question: string }[];
  hasChecks: boolean;
  /** null : démonstration (tests et questions indisponibles). */
  reportId: string | null;
  options?: React.ReactNode;
}) {
  const t = useT();
  const sheets = { toc: useRef<HTMLDialogElement>(null), test: useRef<HTMLDialogElement>(null), ask: useRef<HTMLDialogElement>(null) };
  const [active, setActive] = useState<string | null>(toc[0]?.id ?? null);
  const [quiz, setQuiz] = useState<{ scope: "section" | "document"; sectionId: string | null; run: number } | null>(null);
  const [askOpened, setAskOpened] = useState(false);
  const current = toc.find((t) => t.id === active) ?? toc[0] ?? null;

  // Position de lecture : la partie visible sert au sommaire, à l'interrogation et aux questions.
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

  function open(name: Exclude<Sheet, null>) {
    if (name === "test") setQuiz(null);
    if (name === "ask") setAskOpened(true);
    sheets[name].current?.showModal();
  }
  function goTo(id: string) {
    sheets.test.current?.close();
    sheets.toc.current?.close();
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }

  const head = (id: string, title: string, ref: React.RefObject<HTMLDialogElement | null>) => (
    <>
      <div className="sheet-grip" aria-hidden="true" />
      <div className="sheet-head">
        <h2 id={id}>{title}</h2>
        <button type="button" className="ib" aria-label={t.reader.close} onClick={() => ref.current?.close()}>
          <Icon name="close" />
        </button>
      </div>
    </>
  );

  return (
    <>
      <nav className="readerbar" aria-label={t.reader.toc}>
        <button type="button" className="rb" aria-haspopup="dialog" onClick={() => open("toc")}>
          <Icon name="list" /> <span>{t.reader.toc}</span>
        </button>
        <button type="button" className="rb" aria-haspopup="dialog" onClick={() => open("test")}>
          <Icon name="quiz" /> <span>{t.test.button}</span>
        </button>
        <button type="button" className="ask" aria-haspopup="dialog" onClick={() => open("ask")}>
          <Icon name="chat" /> <span>{t.ask.button}</span>
        </button>
      </nav>

      <dialog ref={sheets.toc} className="sheet side" aria-labelledby="toc-sheet-title">
        {head("toc-sheet-title", t.reader.inThisReport, sheets.toc)}
        <p className="muted small">{t.reader.tocHint}</p>
        <nav className="toc" aria-labelledby="toc-sheet-title">
          <ol>
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} aria-current={active === t.id ? "location" : undefined} onClick={() => sheets.toc.current?.close()}>
                  {t.question}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        {options && (
          <section className="sheet-options" aria-labelledby="options-title">
            <h3 id="options-title" className="eyebrow">{t.options.open}</h3>
            {options}
          </section>
        )}
        <Link href="/" className="btn btn-block">{t.reader.toLibrary}</Link>
      </dialog>

      <dialog
        ref={sheets.test}
        className="sheet side quiz-sheet"
        aria-labelledby="test-sheet-title"
        onClose={() => setQuiz(null)}
      >
        {head("test-sheet-title", quiz ? (quiz.scope === "section" ? t.test.interro : t.test.devoir) : t.test.title, sheets.test)}
        {!reportId ? (
          <p className="notice">{t.test.unavailable}</p>
        ) : quiz ? (
          <QuizRunner
            key={`${quiz.scope}-${quiz.sectionId}-${quiz.run}`}
            reportId={reportId}
            scope={quiz.scope}
            sectionId={quiz.sectionId}
            onClose={() => sheets.test.current?.close()}
            onGoTo={goTo}
          />
        ) : (
          <div className="stagger">
            <p className="lede small-lede">{t.test.lede}</p>
            <ul className="rows test-choices">
              {current && (
                <li>
                  <button type="button" className="row" onClick={() => setQuiz({ scope: "section", sectionId: current.id, run: Date.now() })}>
                    <span className="row-icon"><Icon name="quiz" /></span>
                    <span className="row-text"><b>{t.test.interro}</b><small>{t.test.interroSub(current.question)}</small></span>
                    <Icon name="chevron" className="row-chevron" />
                  </button>
                </li>
              )}
              <li>
                <button type="button" className="row" onClick={() => setQuiz({ scope: "document", sectionId: null, run: Date.now() })}>
                  <span className="row-icon"><Icon name="book" /></span>
                  <span className="row-text"><b>{t.test.devoir}</b><small>{t.test.devoirSub}</small></span>
                  <Icon name="chevron" className="row-chevron" />
                </button>
              </li>
              {hasChecks && (
                <li>
                  <button type="button" className="row" onClick={() => goTo("verifier")}>
                    <span className="row-icon"><Icon name="chat" /></span>
                    <span className="row-text"><b>{t.test.open}</b><small>{t.test.openSub}</small></span>
                    <Icon name="chevron" className="row-chevron" />
                  </button>
                </li>
              )}
            </ul>
          </div>
        )}
      </dialog>

      <dialog ref={sheets.ask} className="sheet side ask-sheet" aria-labelledby="ask-sheet-title">
        {head("ask-sheet-title", t.ask.title, sheets.ask)}
        {!reportId ? (
          <p className="notice">{t.ask.unavailable}</p>
        ) : (
          askOpened && <AskPanel reportId={reportId} section={current ? { id: current.id, title: current.question } : null} />
        )}
      </dialog>
    </>
  );
}
