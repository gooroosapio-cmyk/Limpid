"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { ReportLink } from "@/components/ReportLink";
import type { VisualSpec } from "@/lib/contracts/schemas";
import { useT } from "@/lib/i18n/client";
import type { AssetView } from "@/lib/render/visuals";
import type { FlashcardBank } from "@/lib/supports/flashcards";
import { isDue } from "@/lib/supports/schedule";
import { FlashcardSession, type SessionSnapshot } from "./FlashcardSession";

export interface CardProgress {
  next_review_at: string | null;
  last_rating: string | null;
}

/**
 * Onglet Révisions (§ 4) : flashcards (à revoir aujourd'hui, choix du chapitre, reprise de
 * session), QCM du cours et QCM des chapitres. Les flashcards complètent les activités
 * existantes ; leur absence ne bloque jamais les QCM. Aucun appel IA.
 */
export function Revisions({
  reportId,
  bank,
  outdated,
  chapters,
  initialChapter,
  hasBilan,
  chapterQuizzes,
  visuals,
  assets,
  progress = {},
  session = null,
}: {
  reportId: string;
  bank: FlashcardBank | null;
  outdated: boolean;
  chapters: { id: string; title: string }[];
  initialChapter: string | null;
  hasBilan: boolean;
  chapterQuizzes: number;
  visuals: VisualSpec[];
  assets: Record<string, AssetView>;
  progress?: Record<string, CardProgress>;
  session?: SessionSnapshot | null;
}) {
  const t = useT();
  const r = t.supports.review;
  const [chapter, setChapter] = useState<string>(initialChapter && chapters.some((c) => c.id === initialChapter) ? initialChapter : "all");
  const [running, setRunning] = useState<SessionSnapshot | null>(null);
  const [local, setLocal] = useState(progress);
  const cards = useMemo(() => bank?.cards ?? [], [bank]);
  const inScope = useMemo(() => cards.filter((c) => chapter === "all" || c.chapter_id === chapter), [cards, chapter]);
  // Fuseau de l'appareil : « aujourd'hui » se compte en jour local.
  const offset = typeof window === "undefined" ? 0 : new Date().getTimezoneOffset();
  const due = useMemo(() => inScope.filter((c) => isDue(local[c.id], new Date(), offset)), [inScope, local, offset]);
  const firstQuizChapter = chapters[0]?.id ?? null;

  if (running && bank) {
    return (
      <FlashcardSession
        reportId={reportId}
        bank={bank}
        snapshot={running}
        visuals={visuals}
        assets={assets}
        onExit={(updates) => {
          setLocal((p) => ({ ...p, ...updates }));
          setRunning(null);
        }}
      />
    );
  }

  const hasActivity = cards.length > 0 || hasBilan || chapterQuizzes > 0;
  return (
    <section className="rev" aria-labelledby="rev-h">
      <h2 id="rev-h" className="sr-only">{r.title}</h2>
      {cards.length > 0 && (
        <div className="rev-cards">
          <div className="rev-today">
            <span className="rev-today-ic" aria-hidden="true"><Icon name="cards" size={22} /></span>
            <span>
              <b>{r.today}</b>
              <small>{r.todayCount(due.length)}</small>
            </span>
          </div>
          {outdated && <p className="support-chip">{t.supports.status.outdated}</p>}
          <label className="mm-select rev-chapter">
            <span className="sr-only">{r.chapter}</span>
            <select value={chapter} onChange={(e) => setChapter(e.target.value)}>
              <option value="all">{r.allChapters}</option>
              {chapters
                .filter((c) => cards.some((x) => x.chapter_id === c.id))
                .map((c, i) => (
                  <option key={c.id} value={c.id}>{`${i + 1}. ${c.title}`}</option>
                ))}
            </select>
            <Icon name="chevron" size={16} className="mm-select-caret" />
          </label>
          <div className="rev-launch">
            {session && session.queue.length > session.position && (
              <button type="button" className="btn btn-primary btn-block" onClick={() => setRunning(session)}>
                <Icon name="refresh" size={18} /> {r.resume}
              </button>
            )}
            {due.length > 0 ? (
              <button type="button" className={`btn btn-block${session ? "" : " btn-primary"}`} onClick={() => setRunning({ id: null, queue: due.map((c) => c.id), position: 0, revealed: null })}>
                <Icon name="cards" size={18} /> {r.start}
              </button>
            ) : (
              inScope.length > 0 && (
                <button type="button" className="btn btn-block" onClick={() => setRunning({ id: null, queue: inScope.map((c) => c.id), position: 0, revealed: null })}>
                  <Icon name="cards" size={18} /> {r.startAll}
                </button>
              )
            )}
          </div>
          <p className="muted small">{r.flashcardsSub(cards.length)}</p>
        </div>
      )}

      {(hasBilan || chapterQuizzes > 0) && (
        <ul className="rows rev-quiz">
          {hasBilan && (
            <li>
              <ReportLink href={`/rapports/${reportId}/bilan`} className="row" immersive>
                <span className="row-icon"><Icon name="quiz" /></span>
                <span className="row-text"><b>{r.quiz}</b><small>{r.quizSub}</small></span>
                <Icon name="chevron" className="row-chevron" />
              </ReportLink>
            </li>
          )}
          {chapterQuizzes > 0 && firstQuizChapter && (
            <li>
              <ReportLink href={`/rapports/${reportId}?a=${encodeURIComponent(chapter !== "all" ? chapter : firstQuizChapter)}`} className="row" immersive>
                <span className="row-icon"><Icon name="check" /></span>
                <span className="row-text"><b>{r.chapterQuiz}</b><small>{r.chapterQuizSub}</small></span>
                <Icon name="chevron" className="row-chevron" />
              </ReportLink>
            </li>
          )}
        </ul>
      )}
      {!hasActivity && <p className="muted">{r.none}</p>}
    </section>
  );
}
