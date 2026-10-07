"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useDialogHistory } from "@/components/shell/useDialogHistory";
import type { ChapterQuestion, Exercise } from "@/lib/contracts/schemas";
import { useT } from "@/lib/i18n/client";
import { drawLot } from "@/lib/reader/quiz-draw";
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

/** Réponse validée à une question du QCM de chapitre. */
interface QuizAnswer {
  choice: number;
  correct: boolean;
}

/**
 * Mini-QCM de chapitre : à chaque visite, un lot de 2 questions (3 si la banque est riche)
 * est tiré localement dans la banque du chapitre (2 à 8), en évitant le lot précédent ; aucun
 * appel IA. Une question à la fois : choisir → Valider → correction (verte ou rouge, avec
 * texte et icône) et explication → Suivant. « Plus tard » ne compte ni comme réussite ni
 * comme échec et ne bloque jamais la suite.
 */
export function ChapterQuiz({ sectionId, quiz, onSkip }: { sectionId: string; quiz: ChapterQuestion[]; onSkip?: () => void }) {
  const t = useT();
  const reader = useReader();
  const base = useId();
  const memo = `limpid-quiz:${reader.reportId ?? "demo"}:${sectionId}`;
  // Tirage après le montage (le hasard ne doit pas différer entre serveur et navigateur).
  const [items, setItems] = useState<ChapterQuestion[] | null>(null);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [skipped, setSkipped] = useState(false);
  const promptRef = useRef<HTMLLegendElement>(null);

  const draw = useCallback(
    (avoid?: string[]) => {
      let previous = avoid ?? [];
      try {
        if (!avoid) previous = JSON.parse(sessionStorage.getItem(memo) ?? "[]") as string[];
      } catch {}
      const lot = drawLot(quiz, previous);
      try {
        sessionStorage.setItem(memo, JSON.stringify(lot.map((q) => q.id)));
      } catch {}
      setItems(lot);
      setStep(0);
      setPicked(null);
      setAnswers([]);
      setSkipped(false);
    },
    [quiz, memo],
  );
  // eslint-disable-next-line react-hooks/set-state-in-effect -- tirage local à l'arrivée sur le chapitre
  useEffect(() => draw(), [draw]);

  if (!items?.length) return null;
  const q = items[step]!;
  const answer = answers[step];
  const done = items.every((_, k) => answers[k]);
  const good = answers.filter((a) => a.correct).length;

  async function record(all: QuizAnswer[]) {
    if (!reader.reportId || !reader.versionId || !items) return;
    const list = items.map((x, k) => ({ id: x.id, correct: all[k]?.correct ?? null, ratio: null }));
    await fetch(`/api/reports/${reader.reportId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version_id: reader.versionId, kind: "checkpoint", section_id: sectionId, score: list.filter((a) => a.correct).length, total: list.length, answers: list }),
    }).catch(() => undefined);
  }

  function validate() {
    if (picked === null || answer || !items) return;
    const all = [...answers];
    all[step] = { choice: picked, correct: picked === q.correct_index };
    setAnswers(all);
    if (all.filter(Boolean).length === items.length) void record(all);
  }

  function next() {
    setStep((s) => s + 1);
    setPicked(null);
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  const name = `${base}-${q.id}`;
  return (
    <section className="cquiz" aria-labelledby={`${base}-h`}>
      <h3 id={`${base}-h`} className="cquiz-head">{t.lim.quizOptional(items.length)}</h3>
      {skipped ? (
        <p className="muted small" role="status">{t.lim.quizSkipped}</p>
      ) : (
        <>
        <p className="quiz-progress cquiz-progress">{t.lim.question(step + 1, items.length)}</p>
        <fieldset key={q.id} className="cquiz-q" data-answered={answer ? "" : undefined}>
          <legend ref={promptRef} tabIndex={-1} className="cquiz-prompt">{q.prompt}</legend>
          <div className="cquiz-choices">
            {q.choices.map((c, ci) => {
              const state = !answer ? "" : ci === answer.choice ? (answer.correct ? " is-right" : " is-wrong") : ci === q.correct_index ? " is-answer" : "";
              return (
                <label key={ci} className={`cquiz-choice${state}`}>
                  <input type="radio" name={name} value={ci} checked={picked === ci} disabled={!!answer} onChange={() => setPicked(ci)} />
                  <span>{c}</span>
                </label>
              );
            })}
          </div>
          {!answer && (
            <button type="button" className="btn cquiz-validate" disabled={picked === null} onClick={validate}>
              {t.lim.validate}
            </button>
          )}
          <div aria-live="polite">
            {answer && (
              <div className={`cquiz-feedback ${answer.correct ? "is-right" : "is-wrong"}`}>
                <p>
                  <strong>
                    <Icon name={answer.correct ? "check" : "alert"} size={16} /> {answer.correct ? t.lim.quizRight : t.lim.quizWrong}
                  </strong>{" "}
                  {q.explanations[answer.choice]}
                </p>
                {!answer.correct && q.revisit_block_id && (
                  <button type="button" className="btn cquiz-revisit" onClick={() => reader.goTo(q.revisit_block_id!)}>
                    <Icon name="book" size={16} /> {t.lim.quizRevisit}
                  </button>
                )}
              </div>
            )}
          </div>
          {answer && step < items.length - 1 && (
            <button type="button" className="btn btn-primary cquiz-next" onClick={next}>
              {t.lim.quizNext}
            </button>
          )}
        </fieldset>
        </>
      )}
      {done ? (
        <div className="cquiz-done">
          <p role="status">{t.lim.quizGood(good, items.length)}</p>
          {quiz.length > items.length && (
            <button type="button" className="btn-link" onClick={() => draw(items.map((x) => x.id))}>{t.lim.quizNewLot}</button>
          )}
        </div>
      ) : (
        !skipped && (
          <button
            type="button"
            className="btn cquiz-skip"
            onClick={() => {
              setSkipped(true);
              onSkip?.();
            }}
          >
            {t.lim.quizLater}
          </button>
        )
      )}
      <p className="muted small cquiz-note">{t.lim.quizNote}</p>
    </section>
  );
}
