"use client";

import { useId, useState } from "react";
import { useT } from "@/lib/i18n/client";

export interface Feedback {
  verdict: "correct" | "partial" | "incorrect";
  points: { index: number; covered: boolean }[];
  feedback: string;
  misconception: string | null;
}

const VERDICT_CLASS: Record<Feedback["verdict"], string> = {
  correct: "verdict verdict-ok",
  partial: "verdict verdict-partial",
  incorrect: "verdict verdict-ko",
};

/**
 * Question de compréhension : le lecteur répond avec ses mots, la réponse est corrigée
 * point par point. Sans correction possible (démonstration), seuls les éléments de
 * réponse sont proposés.
 */
export function CheckQuiz({
  reportId,
  checkId,
  question,
  expectedPoints,
  refs,
  initial,
}: {
  reportId: string | null;
  checkId: string;
  question: string;
  expectedPoints: string[];
  refs: React.ReactNode;
  initial?: { answer: string; feedback: Feedback } | null;
}) {
  const t = useT();
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [result, setResult] = useState<Feedback | null>(initial?.feedback ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = useId();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reportId || pending || answer.trim().length < 2) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/checks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check_id: checkId, answer }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.message === "string" ? data.message : t.quiz.failed);
      setResult(data as Feedback);
    } catch (err) {
      setError((err as Error).message || t.quiz.failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="card quiz">
      <p className="quiz-question" id={`${base}-q`}>{question}</p>
      {reportId && (
        <form onSubmit={submit} aria-labelledby={`${base}-q`}>
          <label htmlFor={`${base}-a`} className="sr-only">{t.quiz.answerLabel}</label>
          <textarea
            id={`${base}-a`}
            className="quiz-answer"
            value={answer}
            maxLength={2_000}
            placeholder={t.quiz.placeholder}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={pending}
          />
          <button type="submit" className="btn btn-block" disabled={pending || answer.trim().length < 2}>
            {pending ? t.quiz.grading : result ? t.quiz.retry : t.quiz.submit}
          </button>
        </form>
      )}
      {error && <p className="notice notice-warn" role="alert">{error}</p>}
      <div aria-live="polite">
        {result && !pending && (
          <div className="quiz-result">
            <p className={VERDICT_CLASS[result.verdict]}>{t.quiz.verdicts[result.verdict]}</p>
            <p>{result.feedback}</p>
            {result.misconception && (
              <p className="block-caution quiz-misconception"><strong>{t.quiz.misconception}</strong> {result.misconception}</p>
            )}
          </div>
        )}
      </div>
      <details open={!!result && !pending}>
        <summary>{t.quiz.expected}</summary>
        <ul className="quiz-points">
          {expectedPoints.map((p, i) => {
            const covered = result?.points.find((x) => x.index === i + 1)?.covered;
            return (
              <li key={p} className={covered === undefined ? undefined : covered ? "point-ok" : "point-missing"}>
                {covered !== undefined && <span className="sr-only">{covered ? t.quiz.covered : t.quiz.missing} : </span>}
                {p}
              </li>
            );
          })}
        </ul>
        {refs}
      </details>
    </div>
  );
}
