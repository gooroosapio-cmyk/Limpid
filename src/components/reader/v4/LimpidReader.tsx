"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import type { Exercise } from "@/lib/contracts/schemas";
import { useT } from "@/lib/i18n/client";
import { paginate, viewOf, type View } from "@/lib/reader/paginate";
import { AskPanel } from "../AskPanel";
import { ANCHOR_RE, progressKey, useAnnex } from "../annex-link";
import { Bilan } from "./Bilan";
import { ReaderCtx, type ReaderApi } from "./context";
import { OptionsPanel, type OptionsData } from "./OptionsPanel";
import { ReformulatePanel } from "./ReformulatePanel";
import { useDialogHistory } from "@/components/shell/useDialogHistory";

const CONTINUOUS_KEY = "limpid-continuous";

export interface Chapter {
  id: string;
  title: string;
}

/**
 * Lecteur plein écran (V4, § 7 à 10) : vues composées à partir des hauteurs mesurées des
 * pièces, carrousel vertical une vue à la fois (ou lecture continue), barre basse Sommaire /
 * progression / Options, bouton flottant Discuter. Le retour ferme d'abord un panneau.
 */
export function LimpidReader({
  reportId,
  versionId,
  chapters,
  initialAnchor,
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
  const viewsRef = useRef<View[]>([]);
  const piecesRef = useRef<HTMLElement[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });
  const [views, setViews] = useState<View[]>([]);
  const [current, setCurrent] = useState(0);
  const [continuous, setContinuous] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [chapter, setChapter] = useState<Chapter | null>(chapters[0] ?? null);
  const [askOpened, setAskOpened] = useState(false);
  const [askQuestion, setAskQuestion] = useState("");
  // Une référence par boîte de dialogue (et non un objet de références, illisible pour React).
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
  const anchorRef = useRef<string | null>(initialAnchor);
  /** Ancre de retour d'annexe (`?a=`) : undefined = pas encore lue. */
  const backAnchor = useRef<string | null | undefined>(undefined);
  /** Première composition faite : avant, une position de défilement n'est pas une lecture. */
  const laidOut = useRef(false);
  const titles = useMemo(() => Object.fromEntries(chapters.map((c) => [c.id, c.title])), [chapters]);

  useEffect(() => {
    try {
      // Préférence de l'appareil, lue après l'hydratation (le serveur ne la connaît pas).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setContinuous(localStorage.getItem(CONTINUOUS_KEY) === "1");
    } catch {}
  }, []);

  // Ouverture directe depuis l'aperçu de la leçon : « Demander à Limpid » ou le quiz (?ouvrir=…).
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
      bilanDialog.current?.showModal();
    } else if (open === "options") {
      optionsDialog.current?.showModal();
    }
  }, [bilan]);

  const pieceIndex = useCallback((id: string) => piecesRef.current.findIndex((p) => p.id === id), []);


  const scrollToPiece = useCallback((index: number, smooth = false) => {
    const deck = deckRef.current;
    const views = viewsRef.current;
    if (!deck || index < 0) return;
    const v = views[viewOf(views, index)];
    const target = piecesRef.current[v ? v.start : index];
    if (!target) return;
    const pad = parseFloat(getComputedStyle(deck).paddingTop) || 0;
    deck.scrollTo({ top: target.offsetTop - pad, behavior: smooth ? "smooth" : "auto" });
  }, []);

  /** Mesure les pièces rendues et compose les vues ; l'ancre de lecture est conservée. */
  const layout = useCallback(
    (keepAnchor: string | null) => {
      const deck = deckRef.current;
      if (!deck) return;
      const pieces = [...deck.querySelectorAll<HTMLElement>("[data-piece]")];
      piecesRef.current = pieces;
      for (const p of pieces) {
        p.style.marginBottom = "";
        p.classList.remove("view-start");
      }
      const cs = getComputedStyle(deck);
      const pads = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const available = deck.clientHeight - pads;
      const tops = pieces.map((p) => p.offsetTop);
      const last = pieces[pieces.length - 1];
      const lastBottom = last ? last.offsetTop + last.offsetHeight + (parseFloat(getComputedStyle(last).marginBottom) || 0) : 0;
      const metrics = pieces.map((p, i) => ({
        height: (tops[i + 1] ?? lastBottom) - tops[i]!,
        keepWithNext: p.dataset.keep === "1",
        breakBefore: p.dataset.breakBefore === "1",
        breakAfter: p.dataset.breakAfter === "1",
      }));
      const v = paginate(metrics, available);
      viewsRef.current = v;
      if (!continuous) {
        for (const view of v) {
          pieces[view.start]?.classList.add("view-start");
          if (!view.oversized) {
            const end = pieces[view.end]!;
            const mb = parseFloat(getComputedStyle(end).marginBottom) || 0;
            // Pas d'une vue = hauteur de l'écran de lecture : la vue suivante ne déborde jamais
            // dans les marges réservées (barre, bouton Discuter).
            end.style.marginBottom = `${mb + Math.max(0, available - view.height) + pads}px`;
          }
        }
      }
      setViews(v);
      if (keepAnchor) {
        const i = pieceIndex(keepAnchor);
        if (i >= 0) scrollToPiece(i);
      }
    },
    [continuous, pieceIndex, scrollToPiece],
  );

  // Première composition (polices chargées), puis à chaque changement réel de taille.
  useEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;
    let saved: string | null = initialAnchor;
    try {
      saved = localStorage.getItem(progressKey(reportId ?? "demo")) ?? initialAnchor;
    } catch {}
    // Retour d'annexe : l'adresse porte l'ancre exacte de lecture (`?a=`), lue une seule fois
    // puis retirée de l'adresse une fois la vue rétablie.
    if (backAnchor.current === undefined) {
      const back = new URL(window.location.href).searchParams.get("a");
      backAnchor.current = back && ANCHOR_RE.test(back) ? back : null;
    }
    if (backAnchor.current) {
      saved = backAnchor.current;
      anchorRef.current = backAnchor.current;
    }
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      sizeRef.current = { w: deck.clientWidth, h: deck.clientHeight };
      layout(saved);
      laidOut.current = true;
      if (backAnchor.current) {
        const url = new URL(window.location.href);
        url.searchParams.delete("a");
        window.history.replaceState(window.history.state, "", url.toString());
      }
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const relayout = () => {
      clearTimeout(timer);
      timer = setTimeout(() => layout(anchorRef.current), 160);
    };
    // Taille de l'écran : ignore les petites variations des barres du navigateur.
    const deckObs = new ResizeObserver(() => {
      const { w, h } = sizeRef.current;
      if (Math.abs(deck.clientWidth - w) > 1 || Math.abs(deck.clientHeight - h) > 48) {
        sizeRef.current = { w: deck.clientWidth, h: deck.clientHeight };
        relayout();
      }
    });
    deckObs.observe(deck);
    // Contenu d'une pièce (correction affichée, police agrandie) : nouvelle composition.
    const pieceObs = new ResizeObserver(() => relayout());
    deck.querySelectorAll("[data-piece]").forEach((p) => pieceObs.observe(p));
    const attrObs = new MutationObserver(relayout);
    attrObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-text"] });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      deckObs.disconnect();
      pieceObs.disconnect();
      attrObs.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  // Vue affichée, chapitre courant, transition « page tournée », progression enregistrée.
  useEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;
    let raf = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let shown = -1;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const views = viewsRef.current;
        const pieces = piecesRef.current;
        if (!views.length) return;
        const y = deck.scrollTop + deck.clientHeight * 0.35;
        let idx = 0;
        for (let i = 0; i < views.length; i++) if ((pieces[views[i]!.start]?.offsetTop ?? 0) <= y) idx = i;
        if (!laidOut.current) return;
        setCurrent(idx);
        const start = pieces[views[idx]!.start];
        anchorRef.current = start?.id ?? null;
        const sec = start?.closest<HTMLElement>("[data-section]")?.dataset.section ?? start?.dataset.section;
        const ch = chapters.find((c) => c.id === sec);
        if (ch) setChapter(ch);
        clearTimeout(settle);
        settle = setTimeout(() => {
          if (idx === shown) return;
          shown = idx;
          const v = views[idx]!;
          for (let k = v.start; k <= v.end; k++) {
            const p = pieces[k];
            if (!p) continue;
            p.classList.remove("turn-in");
            void p.offsetWidth;
            p.classList.add("turn-in");
          }
          if (start?.id) {
            try {
              localStorage.setItem(progressKey(reportId ?? "demo"), start.id);
            } catch {}
            if (reportId) {
              void fetch(`/api/reports/${reportId}/progress`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ anchor: start.id, read: !markedRead.current }),
              }).catch(() => undefined);
              markedRead.current = true;
            }
          }
        }, 180);
      });
    };
    deck.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      deck.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    };
  }, [chapters, reportId, views]);

  const api: ReaderApi = useMemo(
    () => ({
      reportId,
      versionId,
      suspend: (on) => setSuspended(on),
      continueAfter: (id) => {
        setSuspended(false);
        const i = pieceIndex(id);
        if (i < 0) return;
        const v = viewOf(viewsRef.current, i);
        const next = viewsRef.current[v + 1];
        scrollToPiece(next ? next.start : i, true);
      },
      goTo: (id) => {
        [tocDialog, optionsDialog, askDialog, bilanDialog, reformDialog].forEach((d) => d.current?.close());
        scrollToPiece(pieceIndex(id), true);
      },
      openBilan: () => bilanDialog.current?.showModal(),
      openReformulate: () => reformDialog.current?.showModal(),
    }),
    [reportId, versionId, pieceIndex, scrollToPiece],
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

  function toggleContinuous(on: boolean) {
    setContinuous(on);
    try {
      localStorage.setItem(CONTINUOUS_KEY, on ? "1" : "0");
    } catch {}
  }

  const total = Math.max(1, views.length);
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
          <Icon name="close" /> <span>{t.lim.close}</span>
        </button>
        {chapter && <p className="rtop-chapter" aria-live="off">{chapter.title}</p>}
      </header>

      <div
        ref={deckRef}
        className={`deck${continuous ? " continuous" : ""}${suspended ? " no-snap" : ""}`}
        tabIndex={0}
        role="region"
        aria-label={t.lim.deckLabel}
      >
        <div className="deck-col">{children}</div>
      </div>

      <button type="button" className="discuss" aria-label={t.lim.discussLabel} aria-haspopup="dialog" onClick={() => { setAskOpened(true); askDialog.current?.showModal(); }}>
        <Icon name="chat" /> <span>{t.lim.discuss}</span>
      </button>

      <nav className="rbar" aria-label={t.lim.toc}>
        <button type="button" className="rb" aria-haspopup="dialog" onClick={() => tocDialog.current?.showModal()}>
          <Icon name="list" /> <span>{t.lim.toc}</span>
        </button>
        <div
          className="rprogress"
          role="progressbar"
          aria-label={t.lim.progress}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={current + 1}
          aria-valuetext={t.lim.progressLabel(current + 1, total)}
        >
          <span className="rprogress-n" aria-hidden="true">{current + 1} / {total}</span>
          <span className="rprogress-bar" aria-hidden="true"><i ref={(el) => { if (el) el.style.width = `${((current + 1) / total) * 100}%`; }} /></span>
        </div>
        <button type="button" className="rb" aria-haspopup="dialog" onClick={() => optionsDialog.current?.showModal()}>
          <Icon name="more" /> <span>{t.lim.options}</span>
        </button>
      </nav>

      <dialog ref={tocDialog} className="sheet side" aria-labelledby="toc-h">
        {head("toc-h", t.reader.inThisReport, tocDialog)}
        <nav className="toc" aria-labelledby="toc-h">
          <ol>
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
          continuous={continuous}
          onContinuous={toggleContinuous}
          onNavigate={() => optionsDialog.current?.close()}
          annexHref={(hash) => annex?.href(hash, anchorRef.current) ?? `#${hash}`}
          onAnnex={(hash) => annex?.open(hash, anchorRef.current)}
        />
      </dialog>

      <dialog ref={askDialog} className="sheet side ask-sheet" aria-labelledby="ask-h">
        {head("ask-h", t.lim.discussLabel, askDialog)}
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
