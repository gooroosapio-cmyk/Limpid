"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import type { Exercise } from "@/lib/contracts/schemas";
import { useT } from "@/lib/i18n/client";
import { AskPanel } from "../AskPanel";
import { ANCHOR_RE, progressKey, useAnnex } from "../annex-link";
import { Bilan } from "./Bilan";
import { ReaderCtx, type ReaderApi } from "./context";
import { OptionsPanel, type OptionsData } from "./OptionsPanel";
import { ReformulatePanel } from "./ReformulatePanel";
import { useDialogHistory } from "@/components/shell/useDialogHistory";

export interface Chapter {
  id: string;
  title: string;
}

/**
 * Lecteur V5 (kit Présentation V5) : une vraie lecture continue, chapitres dans le flux, sans
 * pages d'écran, sans compteur de vues et sans bouton flottant. En-tête discret (Fermer,
 * chapitre courant), barre basse Sommaire / Question / Options. Le retour ferme d'abord un
 * panneau ; fermer un panneau rend la position de lecture intacte.
 */
export function LimpidReader({
  reportId,
  versionId,
  chapters,
  initialAnchor: _initialAnchor,
  bilan,
  insufficient,
  options,
  children,
}: {
  reportId: string | null;
  versionId: string | null;
  chapters: Chapter[];
  initialAnchor: string | null;
  bilan: Exercise[] | null;
  insufficient: boolean;
  options: OptionsData;
  children: React.ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const annex = useAnnex();
  const deckRef = useRef<HTMLDivElement>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [askOpened, setAskOpened] = useState(false);
  const [askQuestion, setAskQuestion] = useState("");
  const tocDialog = useRef<HTMLDialogElement>(null);
  const optionsDialog = useRef<HTMLDialogElement>(null);
  const askDialog = useRef<HTMLDialogElement>(null);
  const bilanDialog = useRef<HTMLDialogElement>(null);
  const reformDialog = useRef<HTMLDialogElement>(null);
  useDialogHistory(tocDialog);
  useDialogHistory(optionsDialog);
  useDialogHistory(askDialog);
  useDialogHistory(bilanDialog);
  useDialogHistory(reformDialog);
  const markedRead = useRef(false);
  const anchorRef = useRef<string | null>(null);
  const titles = useMemo(() => Object.fromEntries(chapters.map((c) => [c.id, c.title])), [chapters]);
  const chapterIndex = chapter ? chapters.findIndex((c) => c.id === chapter.id) : -1;

  // Ouverture directe depuis l'aperçu : « Demander à Limpid », le bilan ou les options (?ouvrir=…).
  useEffect(() => {
    const url = new URL(window.location.href);
    const open = url.searchParams.get("ouvrir");
    if (!open) return;
    const question = (url.searchParams.get("q") ?? "").slice(0, 500);
    url.searchParams.delete("ouvrir");
    url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url.toString());
    if (open === "demander") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- action demandée par l'adresse, une seule fois
      setAskQuestion(question);
      setAskOpened(true);
      askDialog.current?.showModal();
    } else if (open === "bilan" && bilan) {
      if (reportId) router.push(`/rapports/${reportId}/bilan`);
      else bilanDialog.current?.showModal();
    } else if (open === "options") {
      optionsDialog.current?.showModal();
    }
  }, [bilan, reportId, router]);

  /** Défile jusqu'à un élément (compensation de l'en-tête par scroll-margin en CSS). */
  const scrollToId = useCallback((id: string, smooth = false) => {
    const target = document.getElementById(id);
    target?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  }, []);

  // Le cours s'ouvre en tête ; seule une ancre explicite de retour d'annexe (`?a=`) est suivie.
  useEffect(() => {
    const url = new URL(window.location.href);
    const back = url.searchParams.get("a");
    if (!back || !ANCHOR_RE.test(back)) return;
    void document.fonts.ready.then(() => {
      scrollToId(back);
      url.searchParams.delete("a");
      window.history.replaceState(window.history.state, "", url.toString());
    });
  }, [scrollToId]);

  // Chapitre courant (en-tête, sommaire) et position de lecture enregistrée, au défilement.
  useEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;
    let raf = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const line = deck.getBoundingClientRect().top + deck.clientHeight * 0.3;
        const pieces = deck.querySelectorAll<HTMLElement>("[data-piece]");
        let current: HTMLElement | null = null;
        for (const p of pieces) {
          if (p.getBoundingClientRect().top <= line) current = p;
          else break;
        }
        const sec = current?.closest<HTMLElement>("[data-section]")?.dataset.section ?? current?.dataset.section;
        setChapter(chapters.find((c) => c.id === sec) ?? null);
        anchorRef.current = current?.id ?? null;
        clearTimeout(settle);
        settle = setTimeout(() => {
          const id = anchorRef.current;
          if (!id) return;
          try {
            localStorage.setItem(progressKey(reportId ?? "demo"), id);
          } catch {}
          if (reportId && deck.scrollTop > 40) {
            void fetch(`/api/reports/${reportId}/progress`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ anchor: id, read: !markedRead.current }),
            }).catch(() => undefined);
            markedRead.current = true;
          }
        }, 600);
      });
    };
    deck.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      deck.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    };
  }, [chapters, reportId]);

  const closeAll = useCallback(() => [tocDialog, optionsDialog, askDialog, bilanDialog, reformDialog].forEach((d) => d.current?.close()), []);

  const api: ReaderApi = useMemo(
    () => ({
      reportId,
      versionId,
      // Lecture continue : rien à suspendre.
      suspend: () => {},
      continueAfter: (id) => {
        const el = document.getElementById(id);
        const next = el?.closest("[data-piece]")?.nextElementSibling as HTMLElement | null;
        if (next?.id) scrollToId(next.id, true);
      },
      goTo: (id) => {
        closeAll();
        scrollToId(id, true);
      },
      // Kit V5 : le bilan a sa page entière (démonstration : fenêtre, sans enregistrement).
      openBilan: () => (reportId ? router.push(`/rapports/${reportId}/bilan`) : bilanDialog.current?.showModal()),
      openReformulate: () => reformDialog.current?.showModal(),
    }),
    [reportId, versionId, scrollToId, closeAll, router],
  );

  function close() {
    try {
      const from = sessionStorage.getItem("limpid-library-url");
      if (from && document.referrer.startsWith(location.origin) && history.length > 1) return router.back();
      router.push(from || "/");
    } catch {
      router.push("/");
    }
  }

  function openAsk() {
    setAskOpened(true);
    askDialog.current?.showModal();
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
    <ReaderCtx.Provider value={api}>
      <header className="rtop">
        <button type="button" className="rtop-close" onClick={close} aria-label={t.lim.closeLabel}>
          <Icon name="back" /> <span className="sr-only">{t.lim.close}</span>
        </button>
        <p className="rtop-chapter" aria-live="off">{chapter?.title ?? options.title}</p>
        <button type="button" className="rtop-more" aria-label={t.lim.options} aria-haspopup="dialog" onClick={() => optionsDialog.current?.showModal()}>
          <Icon name="more" />
        </button>
      </header>

      <div ref={deckRef} className="deck continuous" tabIndex={0} role="region" aria-label={t.lim.deckLabel}>
        <div className="deck-col">{children}</div>
      </div>

      <nav className="rbar rbar-v5" aria-label={t.lim.readerBar}>
        <button type="button" className="rb" aria-haspopup="dialog" onClick={() => tocDialog.current?.showModal()}>
          <Icon name="list" /> <span>{t.lim.toc}</span>
        </button>
        <button type="button" className="rb" aria-haspopup="dialog" onClick={openAsk}>
          <Icon name="chat" /> <span>{t.lim.questionBtn}</span>
        </button>
        <button type="button" className="rb" aria-haspopup="dialog" onClick={() => optionsDialog.current?.showModal()}>
          <Icon name="more" /> <span>{t.lim.options}</span>
        </button>
      </nav>

      <dialog ref={tocDialog} className="sheet side" aria-labelledby="toc-h">
        {head("toc-h", t.reader.inThisReport, tocDialog)}
        {chapterIndex >= 0 && <p className="muted small toc-where">{t.lim.chapterOf(chapterIndex + 1, chapters.length)}</p>}
        <nav className="toc" aria-labelledby="toc-h">
          <ol>
            <li>
              <a href="#lim_keypoints" onClick={(e) => { e.preventDefault(); api.goTo("lim_keypoints"); }}>{t.lim.keyPoints}</a>
            </li>
            {chapters.map((c) => (
              <li key={c.id}>
                <a href={`#${c.id}`} aria-current={chapter?.id === c.id ? "location" : undefined} onClick={(e) => { e.preventDefault(); api.goTo(c.id); }}>
                  {c.title}
                </a>
              </li>
            ))}
            <li className="toc-check">
              <a href="#end_bilan" onClick={(e) => { e.preventDefault(); api.goTo("end_bilan"); }}>{t.lim.bilanCta}</a>
            </li>
          </ol>
        </nav>
      </dialog>

      <dialog ref={optionsDialog} className="sheet side" aria-labelledby="opt-h">
        {head("opt-h", t.lim.options, optionsDialog)}
        <OptionsPanel
          data={options}
          onNavigate={() => optionsDialog.current?.close()}
          annexHref={(hash) => annex?.href(hash, anchorRef.current) ?? `#${hash}`}
          onAnnex={(hash) => annex?.open(hash, anchorRef.current)}
        />
      </dialog>

      <dialog ref={askDialog} className="sheet side ask-sheet" aria-labelledby="ask-h">
        {head("ask-h", t.lim.questionTitle, askDialog)}
        {!reportId ? <p className="notice">{t.ask.unavailable}</p> : askOpened && <AskPanel reportId={reportId} section={chapter ? { id: chapter.id, title: chapter.title } : null} initialQuestion={askQuestion} />}
      </dialog>

      <dialog ref={bilanDialog} className="sheet side quiz-sheet" aria-labelledby="bilan-h">
        {head("bilan-h", t.lim.bilanTitle, bilanDialog)}
        <Bilan
          initial={bilan}
          insufficient={insufficient}
          reportId={reportId}
          versionId={versionId}
          titles={titles}
          onClose={() => bilanDialog.current?.close()}
          onGoTo={(id) => api.goTo(id)}
        />
      </dialog>

      <dialog ref={reformDialog} className="sheet side" aria-labelledby="ref-h">
        {head("ref-h", t.lim.reformulate, reformDialog)}
        <ReformulatePanel reportId={reportId} onDone={() => reformDialog.current?.close()} />
      </dialog>
    </ReaderCtx.Provider>
  );
}
