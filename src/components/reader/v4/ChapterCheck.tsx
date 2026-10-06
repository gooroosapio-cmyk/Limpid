"use client";

import { useId, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useDialogHistory } from "@/components/shell/useDialogHistory";
import type { ChapterQuestion, Exercise } from "@/lib/contracts/schemas";
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

/** Réponse validée à une question du QCM de chapitre. */
interface QuizAnswer {
  choice: number;
  correct: boolean;
}

/**
 * QCM de chapitre (kit V6, § 09) : dans le flux, en fin de chapitre, jamais dans une fenêtre.
 * « Facultatif · n question(s) », questions empilées, choix uniques ; Valider corrige sur place
 * (explication du choix fait, sans appel IA), « Revoir ce point » mène au bloc concerné. Passer
 * ne compte ni comme réussite ni comme échec et ne bloque jamais le chapitre suivant ; aucun
 * score de maîtrise, seulement « x bonnes réponses sur n » une fois toutes les réponses données.
 */
export function ChapterQuiz({ sectionId, quiz, onSkip }: { sectionId: string; quiz: ChapterQuestion[]; onSkip?: () => void }) {
  const t = useT();
  const reader = useReader();
  const base = useId();
  const items = quiz.slice(0, 3);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [skipped, setSkipped] = useState(false);
  const [run, setRun] = useState(0);
  const done = items.every((q) => answers[q.id]);
  const good = items.filter((q) => answers[q.id]?.correct).length;

  async function record(all: Record<string, QuizAnswer>) {
    if (!reader.reportId || !reader.versionId) return;
    const list = items.map((q) => ({ id: q.id, correct: all[q.id]?.correct ?? null, ratio: null }));
    await fetch(`/api/reports/${reader.reportId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version_id: reader.versionId, kind: "checkpoint", section_id: sectionId, score: list.filter((a) => a.correct).length, total: list.length, answers: list }),
    }).catch(() => undefined);
  }

  function validate(q: ChapterQuestion) {
    const choice = picked[q.id];
    if (choice === undefined || answers[q.id]) return;
    const all = { ...answers, [q.id]: { choice, correct: choice === q.correct_index } };
    setAnswers(all);
    if (items.every((x) => all[x.id])) void record(all);
  }

  function again() {
    setPicked({});
    setAnswers({});
    setSkipped(false);
    setRun((r) => r + 1);
  }

  return (
    <section className="cquiz" aria-labelledby={`${base}-h`}>
      <h3 id={`${base}-h`} className="cquiz-head">{t.lim.quizOptional(items.length)}</h3>
      {items.map((q, qi) => {
        const answer = answers[q.id];
        const name = `${base}-${run}-${q.id}`;
        return (
          <fieldset key={`${run}-${q.id}`} className="cquiz-q" data-answered={answer ? "" : undefined}>
            <legend className="cquiz-prompt">{items.length > 1 ? `${qi + 1}. ` : ""}{q.prompt}</legend>
            <div className="cquiz-choices">
              {q.choices.map((c, ci) => {
                const state = !answer ? "" : ci === answer.choice ? (answer.correct ? " is-right" : " is-wrong") : ci === q.correct_index ? " is-answer" : "";
                return (
                  <label key={ci} className={`cquiz-choice${state}`}>
                    <input type="radio" name={name} value={ci} checked={picked[q.id] === ci} disabled={!!answer} onChange={() => setPicked((p) => ({ ...p, [q.id]: ci }))} />
                    <span>{c}</span>
                  </label>
                );
              })}
            </div>
            {!answer && (
              <button type="button" className="btn cquiz-validate" disabled={picked[q.id] === undefined} onClick={() => validate(q)}>
                {t.lim.validate}
              </button>
            )}
            <div aria-live="polite">
              {answer && (
                <div className={`cquiz-feedback ${answer.correct ? "is-right" : "is-wrong"}`}>
                  <p>
                    <strong>{answer.correct ? <><Icon name="check" size={16} /> {t.lim.quizRight}</> : t.lim.quizWrong}</strong>{" "}
                    {q.explanations[answer.choice]}
                  </p>
                  {q.revisit_block_id && (
                    <button type="button" className="btn cquiz-revisit" onClick={() => reader.goTo(q.revisit_block_id!)}>
                      <Icon name="book" size={16} /> {t.lim.quizRevisit}
                    </button>
                  )}
                </div>
              )}
            </div>
          </fieldset>
        );
      })}
      {done ? (
        <div className="cquiz-done">
          <p role="status">{t.lim.quizGood(good, items.length)}</p>
          <button type="button" className="btn-link" onClick={again}>{t.lim.quizAgain}</button>
        </div>
      ) : (
        <button
          type="button"
          className="btn cquiz-skip"
          aria-pressed={skipped}
          onClick={() => {
            setSkipped(true);
            onSkip?.();
          }}
        >
          {skipped ? t.lim.quizSkipped : t.lim.quizSkip}
        </button>
      )}
      <p className="muted small cquiz-note">{t.lim.quizNote}</p>
    </section>
  );
}
