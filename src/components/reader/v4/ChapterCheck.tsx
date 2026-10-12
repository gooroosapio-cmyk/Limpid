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

/** Réponse à une question du QCM de chapitre : choix validé, ou question passée (« Plus tard »). */
type QuizAnswer = { choice: number; correct: boolean } | { skipped: true };
const isSkip = (a: QuizAnswer | undefined): a is { skipped: true } => !!a && "skipped" in a;

/**
 * QCM de fin de chapitre (retour lecteur) : il s'affiche après « J'ai terminé la lecture ».
 * Une question à la fois, tirée localement dans la banque du chapitre (aucun appel IA) :
 * « Valider » (sans choix : message, rien n'est compté) → correction et explication →
 * « Suivant » ; « Plus tard » passe directement à la question suivante, sans compter ni
 * réussite ni échec. À la fin, `onDone` affiche « Chapitre suivant ».
 */
export function ChapterQuiz({ sectionId, quiz, onDone }: { sectionId: string; quiz: ChapterQuestion[]; onDone?: () => void }) {
  const t = useT();
  const reader = useReader();
  const base = useId();
  const memo = `limpid-quiz:${reader.reportId ?? "demo"}:${sectionId}`;
  // Tirage après le montage (le hasard ne doit pas différer entre serveur et navigateur).
  const [items, setItems] = useState<ChapterQuestion[] | null>(null);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [empty, setEmpty] = useState(false);
  // Kit V5 (QUI-05/06) : variante proposée après une erreur ; id de la variante → question d'origine.
  const [variantOf, setVariantOf] = useState<Record<string, string>>({});
  const promptRef = useRef<HTMLLegendElement>(null);
  const finished = useRef(false);

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
      setEmpty(false);
      setVariantOf({});
      finished.current = false;
    },
    [quiz, memo],
  );
  // eslint-disable-next-line react-hooks/set-state-in-effect -- tirage local à l'arrivée sur le chapitre
  useEffect(() => draw(), [draw]);

  if (!items?.length) return null;
  const done = items.every((_, k) => answers[k]);
  const q = items[Math.min(step, items.length - 1)]!;
  const answer = answers[step];
  // Seules les réponses autonomes comptent : une variante réussie après correction est une réussite aidée.
  const own = items.filter((x) => !variantOf[x.id]);
  const good = items.filter((x, k) => {
    const a = answers[k];
    return !variantOf[x.id] && a && !isSkip(a) && a.correct;
  }).length;
  const passed = items.filter((x, k) => !variantOf[x.id] && isSkip(answers[k])).length;
  const isVariant = !!variantOf[q.id];
  const chosen = answer && !isSkip(answer) ? answer : null;
  /** Question similaire de la banque : même passage à revoir, sinon mêmes affirmations. */
  const similar = (() => {
    if (!chosen || chosen.correct || isVariant) return null;
    const used = new Set(items.map((x) => x.id));
    const rest = quiz.filter((x) => !used.has(x.id));
    const claims = new Set(q.claim_ids);
    return (
      rest.find((x) => q.revisit_block_id && x.revisit_block_id === q.revisit_block_id) ??
      rest.find((x) => x.claim_ids.some((c) => claims.has(c))) ??
      rest[0] ??
      null
    );
  })();

  async function record(all: QuizAnswer[]) {
    if (!reader.reportId || !reader.versionId || !items) return;
    // La tentative initiale n'est jamais écrasée : la variante est enregistrée à côté, reliée à elle.
    // Question passée : enregistrée sans réponse (ni réussite, ni échec).
    const list = items.map((x, k) => {
      const a = all[k];
      return {
        id: x.id,
        correct: a && !isSkip(a) ? a.correct : null,
        ratio: null,
        ...(variantOf[x.id] ? { variant_of: variantOf[x.id], aided: true } : {}),
      };
    });
    const autonomous = list.filter((a) => !a.aided);
    await fetch(`/api/reports/${reader.reportId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version_id: reader.versionId, kind: "checkpoint", section_id: sectionId, score: autonomous.filter((a) => a.correct).length, total: Math.max(1, autonomous.length), answers: list }),
    }).catch(() => undefined);
  }

  function settle(all: QuizAnswer[]) {
    setAnswers(all);
    if (items && all.filter(Boolean).length === items.length && !finished.current) {
      finished.current = true;
      void record(all);
    }
  }

  function tryVariant() {
    if (!similar || !items) return;
    const [v] = drawLot([similar], []);
    if (!v) return;
    setVariantOf((m) => ({ ...m, [v.id]: q.id }));
    setItems([...items.slice(0, step + 1), v, ...items.slice(step + 1)]);
    setAnswers((all) => [...all.slice(0, step + 1), undefined as unknown as QuizAnswer, ...all.slice(step + 1)]);
    goNext();
  }

  function validate() {
    if (answer || !items) return;
    if (picked === null) {
      setEmpty(true);
      return;
    }
    const all = [...answers];
    all[step] = { choice: picked, correct: picked === q.correct_index };
    settle(all);
  }

  function goNext() {
    setStep((s) => s + 1);
    setPicked(null);
    setEmpty(false);
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  /** « Plus tard » : la question est passée, sans compter ; on avance aussitôt. */
  function later() {
    if (answer || !items) return;
    const all = [...answers];
    all[step] = { skipped: true };
    settle(all);
    goNext();
  }

  const name = `${base}-${q.id}`;
  const last = step >= items.length - 1;
  return (
    <section className="cquiz" aria-labelledby={`${base}-h`}>
      <h3 id={`${base}-h`} className="cquiz-head">{t.lim.quizTitle(own.length)}</h3>
      {step < items.length && (
        <>
          <p className="quiz-progress cquiz-progress">{isVariant ? t.lim.quizVariantLabel : t.lim.question(own.indexOf(q) + 1, own.length)}</p>
          <fieldset key={q.id} className="cquiz-q" data-answered={answer ? "" : undefined}>
            <legend ref={promptRef} tabIndex={-1} className="cquiz-prompt">{q.prompt}</legend>
            <div className="cquiz-choices">
              {q.choices.map((c, ci) => {
                const state = !chosen ? "" : ci === chosen.choice ? (chosen.correct ? " is-right" : " is-wrong") : ci === q.correct_index ? " is-answer" : "";
                return (
                  <label key={ci} className={`cquiz-choice${state}`}>
                    <input type="radio" name={name} value={ci} checked={picked === ci} disabled={!!answer} onChange={() => { setPicked(ci); setEmpty(false); }} />
                    <span>{c}</span>
                  </label>
                );
              })}
            </div>
            {empty && !answer && <p className="cquiz-empty" role="alert">{t.lim.quizNoChoice}</p>}
            {!answer && (
              <div className="cquiz-actions">
                <button type="button" className="btn cquiz-validate" onClick={validate}>{t.lim.validate}</button>
                <button type="button" className="btn cquiz-later" onClick={later}>{t.lim.quizLater}</button>
              </div>
            )}
            <div aria-live="polite">
              {chosen && (
                <div className={`cquiz-feedback ${chosen.correct ? "is-right" : "is-wrong"}`}>
                  <p>
                    <strong>
                      <Icon name={chosen.correct ? "check" : "alert"} size={16} /> {chosen.correct ? t.lim.quizRight : t.lim.quizWrong}
                    </strong>{" "}
                    {q.explanations[chosen.choice]}
                  </p>
                  {!chosen.correct && <p className="cquiz-correct-answer"><strong>{t.lim.quizAnswerWas}</strong> {q.choices[q.correct_index]} — {q.explanations[q.correct_index]}</p>}
                  {isVariant && chosen.correct && <p className="muted small">{t.lim.quizAided}</p>}
                  <div className="cquiz-after">
                    {!chosen.correct && q.revisit_block_id && (
                      <button type="button" className="btn-link cquiz-revisit" onClick={() => reader.goTo(q.revisit_block_id!)}>
                        {t.lim.quizRevisit}
                      </button>
                    )}
                    {similar && (
                      <button type="button" className="btn-link cquiz-variant" onClick={tryVariant}>
                        {t.lim.quizVariant}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            {chosen && (
              <button type="button" className="btn btn-primary cquiz-next" onClick={goNext}>
                {last ? t.lim.quizFinish : t.lim.quizNext}
              </button>
            )}
          </fieldset>
        </>
      )}
      {done && step >= items.length && (
        <QuizSummary good={good} total={own.length} passed={passed} onDone={onDone} canRedraw={quiz.length > items.length} redraw={() => draw(items.map((x) => x.id))} />
      )}
    </section>
  );
}

function QuizSummary({ good, total, passed, onDone, canRedraw, redraw }: { good: number; total: number; passed: number; onDone?: () => void; canRedraw: boolean; redraw: () => void }) {
  const t = useT();
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    onDone?.();
  }, [onDone]);
  return (
    <div className="cquiz-done">
      <p role="status">{t.lim.quizGood(good, total)}{passed > 0 ? ` · ${t.lim.quizPassedCount(passed)}` : ""}</p>
      {canRedraw && <button type="button" className="btn-link" onClick={redraw}>{t.lim.quizNewLot}</button>}
    </div>
  );
}
