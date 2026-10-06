"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useDialogHistory } from "@/components/shell/useDialogHistory";
import type { Exercise } from "@/lib/contracts/schemas";
import { useT } from "@/lib/i18n/client";
import { useReader } from "./context";
import { ExerciseView, type ExerciseResult } from "./ExerciseView";

/**
 * Mini-interrogation de chapitre (kit V5) : invitation discrète en fin de chapitre, jamais
 * ouverte d'office. Dans la fenêtre : une question à la fois, correction immédiate après
 * Valider, puis « x réponses justes sur n ». Passer ne compte jamais comme réussi ; fermer
 * rend la position de lecture.
 */
export function ChapterCheck({ id, sectionId, title, exercises }: { id: string; sectionId: string; title: string; exercises: Exercise[] }) {
  const t = useT();
  const reader = useReader();
  const dialog = useRef<HTMLDialogElement>(null);
  useDialogHistory(dialog);
  const [i, setI] = useState(0);
  const [results, setResults] = useState<ExerciseResult[]>([]);
  const [current, setCurrent] = useState<ExerciseResult | null>(null);
  const [run, setRun] = useState(0);
  const items = exercises.slice(0, 5);
  const done = results.length === items.length;
  const good = results.filter((r) => r.correct).length;

  function open() {
    if (done) {
      setResults([]);
      setI(0);
      setRun((r) => r + 1);
    }
    setCurrent(null);
    dialog.current?.showModal();
  }

  async function record(all: ExerciseResult[]) {
    if (!reader.reportId || !reader.versionId) return;
    await fetch(`/api/reports/${reader.reportId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version_id: reader.versionId, kind: "checkpoint", section_id: sectionId, score: all.filter((r) => r.correct).length, total: all.length, answers: all }),
    }).catch(() => undefined);
  }

  function next() {
    if (!current) return;
    const all = [...results, current];
    setResults(all);
    setCurrent(null);
    if (all.length < items.length) setI(all.length);
    else void record(all);
  }

  const q = items[i];
  return (
    <>
      <button type="button" className="chapter-check" aria-haspopup="dialog" onClick={open}>
        <Icon name="quiz" size={18} /> <span>{t.lim.checkChapter(items.length)}</span>
        {done && <span className="chapter-check-score">{t.lim.checkResult(good, items.length)}</span>}
      </button>
      <dialog ref={dialog} className="sheet side quiz-sheet" aria-labelledby={`${id}-h`}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id={`${id}-h`}>{t.lim.checkpoint}</h2>
          <button type="button" className="ib" aria-label={t.reader.close} onClick={() => dialog.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <p className="muted small">{title}</p>
        {done ? (
          <div className="stagger">
            <p className="quiz-verdict ok" role="status"><Icon name="check" /> {t.lim.checkResult(good, items.length)}</p>
            {good < items.length && (
              <button type="button" className="btn-link" onClick={() => { dialog.current?.close(); reader.goTo(sectionId); }}>
                <Icon name="book" size={16} /> {t.lim.reviewExplanation}
              </button>
            )}
            <button type="button" className="btn btn-primary btn-block" onClick={() => dialog.current?.close()}>{t.lim.continueReading}</button>
          </div>
        ) : (
          q && (
            <div>
              <p className="quiz-progress">{t.lim.question(i + 1, items.length)}</p>
              <ExerciseView key={`${run}-${q.id}`} ex={q} reportId={reader.reportId} versionId={reader.versionId} onDone={(r) => setCurrent(r)} />
              {current ? (
                <button type="button" className="btn btn-primary btn-block" autoFocus onClick={next}>
                  {t.lim.continueBtn} <Icon name="arrow" />
                </button>
              ) : (
                <button type="button" className="btn-link" onClick={() => dialog.current?.close()}>{t.lim.skip}</button>
              )}
            </div>
          )
        )}
      </dialog>
    </>
  );
}
