"use client";

import { walletChanged } from "@/components/billing/wallet-store";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { LoaderBook } from "@/components/LoaderBook";
import type { Exercise } from "@/lib/contracts/schemas";
import { apiMessage } from "@/lib/i18n/api";
import { useLang, useT } from "@/lib/i18n/client";
import { ExerciseView, type ExerciseResult } from "./ExerciseView";

type Phase = "intro" | "loading" | "running" | "done" | "error";

interface OldQuestion {
  id: string;
  question: string;
  options: { text: string; why: string }[];
  answer: number;
  sectionId: string;
  sectionTitle: string;
}

/** Ancien format (QCM à la demande) → exercice V4 à réponse unique. */
function fromOld(q: OldQuestion): Exercise {
  return {
    id: q.id.replace(/^q/, "ex_q"),
    kind: "single",
    prompt: q.question,
    objective: q.sectionTitle,
    notion: q.sectionTitle,
    section_id: q.sectionId,
    evidence_ids: [],
    options: q.options.map((o, i) => ({ text: o.text, correct: i === q.answer, why: o.why })),
    truth: null,
    items: [],
    pairs: [],
    blanks: [],
    expected: null,
    rubric: [],
    explanation: q.options[q.answer]?.why ?? "",
  };
}

/**
 * Bilan de compréhension (V4, § 10) : 5 à 25 questions sur tout le document, une à la fois,
 * puis le score observé (distinct de la maîtrise), les notions à revoir et les tentatives
 * précédentes. Chaque tentative est conservée.
 */
export function Bilan({
  initial,
  insufficient,
  reportId,
  versionId,
  titles,
  onClose,
  onGoTo,
}: {
  initial: Exercise[] | null;
  insufficient: boolean;
  reportId: string | null;
  versionId: string | null;
  titles: Record<string, string>;
  onClose: () => void;
  onGoTo: (sectionId: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [questions, setQuestions] = useState<Exercise[] | null>(initial);
  const [phase, setPhase] = useState<Phase>("intro");
  const [i, setI] = useState(0);
  const [results, setResults] = useState<ExerciseResult[]>([]);
  const [current, setCurrent] = useState<ExerciseResult | null>(null);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState<{ score: number; total: number; created_at: string }[]>([]);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!reportId || !versionId) return;
    fetch(`/api/reports/${reportId}/attempts?version=${versionId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { attempts: [] }))
      .then((d) => setAttempts(d.attempts ?? []))
      .catch(() => undefined);
  }, [reportId, versionId, run]);

  async function prepare() {
    if (!reportId) return;
    setPhase("loading");
    try {
      const res = await fetch(`/api/reports/${reportId}/quiz`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "document" }) });
      const data = await res.json().catch(() => ({}));
      walletChanged();
      if (!res.ok || !Array.isArray(data.questions)) throw new Error(apiMessage(t, data, ""));
      setQuestions((data.questions as OldQuestion[]).map(fromOld));
      setPhase("intro");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  function start() {
    setResults([]);
    setCurrent(null);
    setI(0);
    setPhase("running");
  }

  async function finish(all: ExerciseResult[]) {
    setPhase("done");
    if (!reportId || !versionId || !questions) return;
    await fetch(`/api/reports/${reportId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version_id: versionId, kind: "bilan", score: all.filter((r) => r.correct).length, total: questions.length, answers: all }),
    }).catch(() => undefined);
    setRun((r) => r + 1);
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  if (phase === "loading")
    return (
      <div className="quiz-loading" role="status">
        <LoaderBook />
        <p><b>{t.lim.bilanPreparing}</b></p>
      </div>
    );
  if (phase === "error") return <p className="notice notice-error" role="alert">{error || t.test.failed}</p>;

  if (phase === "intro")
    return (
      <div className="bilan-intro stagger">
        {questions?.length ? (
          <>
            <p className="lede small-lede">{t.lim.bilanIntro(questions.length)}</p>
            {insufficient && <p className="notice">{t.lim.bilanInsufficient}</p>}
            <button type="button" className="btn btn-primary btn-block" onClick={start}>{t.lim.bilanStart} <Icon name="arrow" /></button>
          </>
        ) : (
          <>
            <p className="lede small-lede">{reportId ? t.lim.bilanCtaSub : t.test.unavailable}</p>
            {reportId && <button type="button" className="btn btn-primary btn-block" onClick={prepare}>{t.lim.bilanPrepare}</button>}
          </>
        )}
        {attempts.length > 0 && (
          <section aria-labelledby="bilan-prev">
            <h3 id="bilan-prev" className="eyebrow">{t.lim.bilanPrev}</h3>
            <ul className="attempts">
              {attempts.map((a) => (
                <li key={a.created_at}><span>{when(a.created_at)}</span><b>{a.score} / {a.total}</b></li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );

  if (phase === "done" && questions) {
    const good = results.filter((r) => r.correct).length;
    const review = [...new Set(questions.filter((q, k) => results[k]?.correct !== true).map((q) => q.section_id))];
    return (
      <div className="quiz-done stagger">
        <p className="eyebrow">{t.lim.bilanObserved}</p>
        <div className="quiz-score" role="status">
          <span className="big">{good}</span>
          <span className="of">/{questions.length}</span>
        </div>
        <p className="muted small">{t.lim.bilanNote}</p>
        {review.length === 0 ? (
          <p className="quiz-verdict ok"><Icon name="check" /> {t.lim.bilanAllGood}</p>
        ) : (
          <>
            <h3 className="eyebrow">{t.lim.bilanReview}</h3>
            <ul className="rows">
              {review.map((sid) => (
                <li key={sid}>
                  <button type="button" className="row" onClick={() => onGoTo(sid)}>
                    <span className="row-icon"><Icon name="refresh" /></span>
                    <span className="row-text"><b>{titles[sid] ?? sid}</b></span>
                    <Icon name="chevron" className="row-chevron" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="actions-row">
          <button type="button" className="btn" onClick={start}>{t.lim.bilanRetry}</button>
          <button type="button" className="btn btn-primary" onClick={onClose}>{t.lim.back}</button>
        </div>
      </div>
    );
  }

  const q = questions?.[i];
  if (!q) return null;
  return (
    <div className="bilan-run">
      <p className="quiz-progress">{t.lim.question(i + 1, questions!.length)}</p>
      <progress value={i + (current ? 1 : 0)} max={questions!.length} aria-hidden="true" />
      <ExerciseView key={`${run}-${q.id}`} ex={q} reportId={reportId} versionId={versionId} onDone={(r) => setCurrent(r)} />
      {current && (
        <button
          type="button"
          className="btn btn-primary btn-block"
          autoFocus
          onClick={() => {
            const all = [...results, current];
            setResults(all);
            setCurrent(null);
            if (i + 1 < questions!.length) setI(i + 1);
            else void finish(all);
          }}
        >
          {i + 1 < questions!.length ? t.lim.next : t.lim.results} <Icon name="arrow" />
        </button>
      )}
    </div>
  );
}
