"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { LoaderBook } from "@/components/LoaderBook";
import { fr } from "@/lib/i18n/fr";

export interface QuizQuestionView {
  id: string;
  question: string;
  options: { text: string; why: string }[];
  answer: number;
  sectionId: string;
  sectionTitle: string;
}

type Phase =
  | { step: "loading" }
  | { step: "error"; message: string }
  | { step: "question"; i: number; picked: number | null; checked: boolean }
  | { step: "done" };

/**
 * Déroulé d'un QCM (kit V3, écrans 15 à 23) : une question à la fois, correction expliquée,
 * bilan limité à la série. Aucune vie, aucune série quotidienne, aucun rouge punitif.
 */
export function QuizRunner({
  reportId,
  scope,
  sectionId,
  onClose,
  onGoTo,
}: {
  reportId: string;
  scope: "section" | "document";
  sectionId: string | null;
  onClose: () => void;
  onGoTo: (sectionId: string) => void;
}) {
  const [questions, setQuestions] = useState<QuizQuestionView[]>([]);
  const [results, setResults] = useState<boolean[]>([]);
  const [phase, setPhase] = useState<Phase>({ step: "loading" });

  async function load(fresh = false) {
    setPhase({ step: "loading" });
    try {
      const res = await fetch(`/api/reports/${reportId}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, ...(sectionId ? { section_id: sectionId } : {}), ...(fresh ? { fresh: true } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.questions)) throw new Error(typeof data.message === "string" ? data.message : fr.test.failed);
      setQuestions(data.questions);
      setResults([]);
      setPhase({ step: "question", i: 0, picked: null, checked: false });
    } catch (e) {
      setPhase({ step: "error", message: (e as Error).message || fr.test.failed });
    }
  }

  useEffect(() => {
    void load();
    // Une seule préparation à l'ouverture ; « D'autres questions » relance explicitement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase.step === "loading")
    return (
      <div className="quiz-loading" role="status">
        <LoaderBook />
        <p><b>{fr.test.loading}</b></p>
        <p className="muted small">{fr.test.loadingSub}</p>
      </div>
    );
  if (phase.step === "error")
    return (
      <div className="quiz-error">
        <p className="notice notice-error" role="alert">{phase.message}</p>
        <button type="button" className="btn btn-block" onClick={() => load()}>{fr.test.retry}</button>
      </div>
    );

  if (phase.step === "done") {
    const good = results.filter(Boolean).length;
    const toReview = questions.filter((_, i) => !results[i]);
    return (
      <div className="quiz-done stagger">
        <p className="eyebrow">{fr.test.doneTitle}</p>
        <div className="quiz-score" role="status">
          <span className="big">{good}</span>
          <span className="of">/{questions.length}</span>
          <span className="lbl">{fr.test.score}</span>
        </div>
        {toReview.length === 0 ? (
          <p className="quiz-verdict ok"><Icon name="check" /> {fr.test.allGood}</p>
        ) : (
          <>
            <h3 className="eyebrow">{fr.test.review}</h3>
            <ul className="rows">
              {[...new Map(toReview.map((q) => [q.sectionId, q])).values()].map((q) => (
                <li key={q.sectionId}>
                  <button type="button" className="row" onClick={() => onGoTo(q.sectionId)}>
                    <span className="row-icon"><Icon name="refresh" /></span>
                    <span className="row-text"><b>{q.sectionTitle}</b></span>
                    <Icon name="chevron" className="row-chevron" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="actions-row">
          <button type="button" className="btn" onClick={() => { setResults([]); setPhase({ step: "question", i: 0, picked: null, checked: false }); }}>
            {fr.test.retry}
          </button>
          <button type="button" className="btn" onClick={() => load(true)}>{fr.test.fresh}</button>
        </div>
        <button type="button" className="btn btn-primary btn-block" onClick={onClose}>{fr.test.back}</button>
        <p className="muted small">{fr.test.doneNote}</p>
      </div>
    );
  }

  const q = questions[phase.i]!;
  const right = phase.checked && phase.picked === q.answer;
  return (
    <div className="quiz" key={q.id}>
      <p className="quiz-progress">{fr.test.progress(phase.i + 1, questions.length)}</p>
      <progress value={phase.i + (phase.checked ? 1 : 0)} max={questions.length} aria-hidden="true" />
      <p className="quiz-section muted small">{q.sectionTitle}</p>
      <fieldset className="choices quiz-options" disabled={phase.checked}>
        <legend className="quiz-question">{q.question}</legend>
        {q.options.map((o, k) => {
          const state = !phase.checked ? "" : k === q.answer ? " is-answer" : k === phase.picked ? " is-picked" : " is-other";
          return (
            <label key={k} className={`choice quiz-option${state}`}>
              <input
                type="radio"
                name={q.id}
                checked={phase.picked === k}
                onChange={() => setPhase({ ...phase, picked: k })}
              />
              <span>
                {o.text}
                {phase.checked && (k === q.answer || k === phase.picked) && <span className="quiz-why">{o.why}</span>}
              </span>
            </label>
          );
        })}
      </fieldset>
      {phase.checked && (
        <p className={right ? "quiz-verdict ok" : "quiz-verdict again"} role="status">
          <Icon name={right ? "check" : "refresh"} /> {right ? fr.test.right : fr.test.wrong}
        </p>
      )}
      {!phase.checked ? (
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={phase.picked === null}
          onClick={() => {
            setResults((r) => [...r, phase.picked === q.answer]);
            setPhase({ ...phase, checked: true });
          }}
        >
          {phase.picked === null ? fr.test.choose : fr.test.validate}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-block"
          autoFocus
          onClick={() =>
            phase.i + 1 < questions.length ? setPhase({ step: "question", i: phase.i + 1, picked: null, checked: false }) : setPhase({ step: "done" })
          }
        >
          {phase.i + 1 < questions.length ? fr.test.next : fr.test.results} <Icon name="arrow" />
        </button>
      )}
    </div>
  );
}
