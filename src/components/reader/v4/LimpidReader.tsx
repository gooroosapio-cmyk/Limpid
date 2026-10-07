"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import type { ChapterQuestion, Exercise } from "@/lib/contracts/schemas";
import { useT } from "@/lib/i18n/client";
import { AskPanel } from "../AskPanel";
import { ANCHOR_RE, progressKey, useAnnex } from "../annex-link";
import { Bilan } from "./Bilan";
import { ChapterQuiz } from "./ChapterCheck";
import { ReaderCtx, type ReaderApi } from "./context";
import { OptionsPanel, type OptionsData } from "./OptionsPanel";
import { ReformulatePanel } from "./ReformulatePanel";
import { useDialogHistory } from "@/components/shell/useDialogHistory";

export interface Chapter {
  id: string;
  title: string;
}

/** Pièce de premier niveau de l'article, rattachée à un chapitre. */
interface Unit {
  el: HTMLElement;
  chapter: number;
  /** Après le dernier chapitre (fin du Limpid, bilan, annexes) : sous la fin du dernier chapitre. */
  tail: boolean;
}

/** Durées de la transition entre chapitres (sortie + entrée ≈ 280 ms, kit V6 § 06). */
const OUT_MS = 110;
const IN_MS = 170;
/** Balayage horizontal intentionnel : distance minimale et dominance sur le vertical. */
const SWIPE_MIN = 80;

function reducedMotion(): boolean {
  return document.documentElement.dataset.motion === "reduit" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Lecteur V6 (kit Présentation V6, § 06) : un chapitre à la fois. Dans le chapitre, défilement
 * vertical naturel, sans hauteur fixe ; le défilement ne change jamais de chapitre. À la fin :
 * « Fin du chapitre », QCM facultatif, puis Précédent / Suivant ; un balayage horizontal
 * intentionnel n'est accepté que dans cette zone. Le résumé d'ouverture accompagne le chapitre 1,
 * la fin du Limpid (bilan, annexes) suit le dernier. Toute ancre (sommaire, sources, notions,
 * « Revoir ce point », retour d'annexe) ouvre d'abord le chapitre qui la contient.
 *
 * Les pièces sont rendues par le serveur dans un seul article : le lecteur masque celles des
 * autres chapitres (attribut `data-chapter-off`) et place la fin de chapitre (portail React)
 * juste après la dernière pièce du chapitre ouvert.
 */
export function LimpidReader({
  reportId,
  versionId,
  chapters,
  initialAnchor: _initialAnchor,
  bilan,
  insufficient,
  options,
  quizzes = {},
  children,
}: {
  reportId: string | null;
  versionId: string | null;
  chapters: Chapter[];
  initialAnchor: string | null;
  /** QCM de fin de chapitre (V6), par identifiant de chapitre. */
  quizzes?: Record<string, ChapterQuestion[]>;
  bilan: Exercise[] | null;
  insufficient: boolean;
  options: OptionsData;
  children: React.ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const annex = useAnnex();
  const deckRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const busyRef = useRef(false);
  const [motion, setMotion] = useState<"" | "out-next" | "out-prev" | "in-next" | "in-prev">("");
  // Fin de chapitre : nœud hors React déplacé sous la dernière pièce du chapitre ouvert.
  const [host, setHost] = useState<HTMLElement | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const chapter: Chapter | null = chapters[index] ?? null;
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
  const chapterIndex = chapter ? index : -1;

  /** Pièces de premier niveau de l'article et leur chapitre (le résumé va au chapitre 1). */
  const units = useCallback((): Unit[] => {
    const col = colRef.current;
    const root = col?.querySelector<HTMLElement>(".lim") ?? col;
    if (!root) return [];
    const ids = new Map(chapters.map((c, i) => [c.id, i]));
    const list: { el: HTMLElement; chapter: number | null }[] = [];
    for (const el of Array.from(root.children) as HTMLElement[]) {
      if (el.dataset.chapterEnd !== undefined) continue;
      const sec = el.dataset.section ?? el.querySelector<HTMLElement>("[data-section]")?.dataset.section;
      list.push({ el, chapter: sec !== undefined && ids.has(sec) ? ids.get(sec)! : null });
    }
    const lastSectioned = list.findLastIndex((u) => u.chapter !== null);
    let current = 0;
    return list.map((u, i) => {
      if (u.chapter !== null) current = u.chapter;
      return { el: u.el, chapter: u.chapter ?? current, tail: u.chapter === null && i > lastSectioned };
    });
  }, [chapters]);

  /** Affiche les pièces du chapitre `i` (les autres sont masquées) et y place la fin de chapitre. */
  const apply = useCallback(
    (i: number) => {
      if (!chapters.length) return;
      const all = units();
      let anchor: HTMLElement | null = null;
      for (const u of all) {
        // QCM V6 du chapitre : l'ancien point de contrôle (fenêtre) n'est plus proposé.
        const replaced = u.el.id.startsWith("ckp_") && !!quizzes[u.el.id.slice(4)]?.length;
        if (u.chapter === i && !replaced) u.el.removeAttribute("data-chapter-off");
        else u.el.setAttribute("data-chapter-off", "");
        if (u.chapter === i && !u.tail) anchor = u.el;
      }
      if (host && anchor && anchor.nextSibling !== host) anchor.after(host);
    },
    [chapters.length, units, quizzes, host],
  );

  /** Chapitre qui contient un élément de la lecture (null : hors de l'article). */
  const chapterOf = useCallback(
    (el: Element): number | null => {
      if (host?.contains(el)) return indexRef.current;
      return units().find((u) => u.el.contains(el))?.chapter ?? null;
    },
    [units, host],
  );

  // Nœud de la fin de chapitre, créé côté client seulement.
  useEffect(() => {
    const el = document.createElement("div");
    el.dataset.chapterEnd = "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nœud DOM du portail, créé une fois après le montage
    setHost(el);
    return () => el.remove();
  }, []);

  // Pièces masquées / fin de chapitre : à chaque changement de chapitre ou de contenu.
  useEffect(() => {
    apply(index);
  }, [apply, index, children]);
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

  /** Ouvre le chapitre `i` : masque les autres, remonte en tête, focus sur le titre. */
  const openChapter = useCallback(
    (i: number, opts: { animate?: boolean; focus?: boolean; then?: () => void } = {}) => {
      if (i < 0 || i >= chapters.length || busyRef.current) return;
      const from = indexRef.current;
      const finish = () => {
        indexRef.current = i;
        setIndex(i);
        apply(i);
        if (opts.then) opts.then();
        else {
          const deck = deckRef.current;
          if (deck) deck.scrollTop = 0;
        }
        if (opts.focus !== false) {
          const title = document.getElementById(chapters[i]!.id)?.querySelector<HTMLElement>("h1, h2");
          if (title) {
            if (!title.hasAttribute("tabindex")) title.setAttribute("tabindex", "-1");
            title.focus({ preventScroll: true });
          }
        }
      };
      if (i === from) return finish();
      const dir = i > from ? "next" : "prev";
      if (opts.animate === false || reducedMotion()) return finish();
      busyRef.current = true;
      setMotion(`out-${dir}`);
      window.setTimeout(() => {
        finish();
        setMotion(`in-${dir}`);
        window.setTimeout(() => {
          setMotion("");
          busyRef.current = false;
        }, IN_MS);
      }, OUT_MS);
    },
    [chapters, apply],
  );

  /** Va à un élément : ouvre d'abord son chapitre, puis y défile. */
  const reach = useCallback(
    (id: string, smooth: boolean) => {
      const el = document.getElementById(id);
      if (!el) return;
      const target = chapterOf(el);
      const isTitle = chapters.some((c) => c.id === id);
      if (target === null || target === indexRef.current) {
        if (isTitle && target !== null) openChapter(target, { animate: false });
        else scrollToId(id, smooth);
        return;
      }
      openChapter(target, { animate: smooth, focus: isTitle, then: isTitle ? undefined : () => requestAnimationFrame(() => scrollToId(id)) });
    },
    [chapterOf, chapters, openChapter, scrollToId],
  );

  // Le cours s'ouvre en tête ; seule une ancre explicite (retour d'annexe `?a=`, `#ancre`) est suivie.
  useEffect(() => {
    const url = new URL(window.location.href);
    const back = url.searchParams.get("a");
    const hash = decodeURIComponent(url.hash.slice(1));
    const anchor = back && ANCHOR_RE.test(back) ? back : hash && ANCHOR_RE.test(hash) ? hash : null;
    if (!anchor || !host) return;
    void document.fonts.ready.then(() => {
      reach(anchor, false);
      if (back) {
        url.searchParams.delete("a");
        window.history.replaceState(window.history.state, "", url.toString());
      }
    });
    // Une seule fois, dès que la fin de chapitre est en place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);

  // Position de lecture enregistrée, au défilement (pièces du chapitre ouvert seulement).
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
          if (p.closest("[data-chapter-off]")) continue;
          if (p.getBoundingClientRect().top <= line) current = p;
          else break;
        }
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
  }, [reportId]);

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
        reach(id, true);
      },
      // Kit V5 : le bilan a sa page entière (démonstration : fenêtre, sans enregistrement).
      openBilan: () => (reportId ? router.push(`/rapports/${reportId}/bilan`) : bilanDialog.current?.showModal()),
      openReformulate: () => reformDialog.current?.showModal(),
    }),
    [reportId, versionId, scrollToId, closeAll, router, reach],
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
        <p className="rtop-chapter" aria-live="off">{chapter ? t.lim.chapterOf(index + 1, chapters.length) : options.title}</p>
        <button type="button" className="rtop-more" aria-label={t.lim.options} aria-haspopup="dialog" onClick={() => optionsDialog.current?.showModal()}>
          <Icon name="more" />
        </button>
      </header>

      <div ref={deckRef} className="deck continuous" tabIndex={0} role="region" aria-label={t.lim.deckLabel}>
        <div ref={colRef} className="deck-col chapters" data-motion={motion || undefined}>{children}</div>
      </div>

      {host && chapter &&
        createPortal(
          <section
            className="chapter-end"
            aria-label={t.lim.chapterEnd}
            onTouchStart={(e) => {
              const target = e.target as HTMLElement;
              const t0 = e.touches[0];
              // Balayage seulement sur la zone elle-même : jamais depuis un contrôle (choix, bouton).
              touch.current = e.touches.length === 1 && t0 && !target.closest("button, a, input, label, select, textarea, [data-no-swipe]") ? { x: t0.clientX, y: t0.clientY } : null;
            }}
            onTouchEnd={(e) => {
              const start = touch.current;
              touch.current = null;
              const t1 = e.changedTouches[0];
              if (!start || !t1 || String(window.getSelection() ?? "").length > 0) return;
              const dx = t1.clientX - start.x;
              const dy = t1.clientY - start.y;
              if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 2) openChapter(index + (dx < 0 ? 1 : -1));
            }}
            onTouchCancel={() => { touch.current = null; }}
          >
            <div className="chapter-end-sep">
              <p className="chapter-end-title">{t.lim.chapterEnd}</p>
              <p className="chapter-end-sub">{index < chapters.length - 1 ? t.lim.chapterEndNext : t.lim.chapterEndLast}</p>
            </div>
            {/* Seul le chapitre ouvert : y revenir plus tard remonte le QCM = nouvelle visite, nouveau lot. */}
            {chapters[index] && quizzes[chapters[index].id]?.length ? (
              <div key={chapters[index].id} className="chapter-end-quiz">
                <ChapterQuiz sectionId={chapters[index].id} quiz={quizzes[chapters[index].id]!} onSkip={() => nextRef.current?.focus()} />
              </div>
            ) : null}
            <nav className="chapter-nav" aria-label={t.lim.chapterNav}>
              <button type="button" className="btn chapter-prev" disabled={index === 0} onClick={() => openChapter(index - 1)}>
                <Icon name="back" size={18} /> {t.lim.prevChapter}
              </button>
              {index < chapters.length - 1 ? (
                <button ref={nextRef} type="button" className="btn btn-primary chapter-next" onClick={() => openChapter(index + 1)}>
                  {t.lim.nextChapter} <Icon name="arrow" size={18} />
                </button>
              ) : (
                <button ref={nextRef} type="button" className="btn chapter-next" aria-haspopup="dialog" onClick={() => tocDialog.current?.showModal()}>
                  <Icon name="list" size={18} /> {t.lim.toc}
                </button>
              )}
            </nav>
          </section>,
          host,
        )}

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
        {!reportId && <Bilan
          initial={bilan}
          insufficient={insufficient}
          reportId={reportId}
          versionId={versionId}
          titles={titles}
          onClose={() => bilanDialog.current?.close()}
          onGoTo={(id) => api.goTo(id)}
        />}
      </dialog>

      <dialog ref={reformDialog} className="sheet side" aria-labelledby="ref-h">
        {head("ref-h", t.lim.reformulate, reformDialog)}
        <ReformulatePanel reportId={reportId} onDone={() => reformDialog.current?.close()} />
      </dialog>
    </ReaderCtx.Provider>
  );
}
