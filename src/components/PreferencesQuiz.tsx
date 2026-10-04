"use client";

import { useEffect, useRef, useState } from "react";
import { QUESTIONS, summarize, type Answers } from "@/lib/preferences";
import { fr } from "@/lib/i18n/fr";

/** Une question par écran, avec Retour, Passer et progression (PDF p. 6). */
export function PreferencesQuiz() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const done = step >= QUESTIONS.length;

  useEffect(() => {
    headingRef.current?.focus(); // annonce la nouvelle question aux lecteurs d'écran
  }, [step]);

  if (done) {
    const summary = summarize(answers);
    return (
      <section className="card" aria-labelledby="pref-summary">
        <h2 id="pref-summary" ref={headingRef} tabIndex={-1}>{fr.preferences.summary}</h2>
        <p>{summary || "Aucune préférence : les réglages de chaque rapport s'appliquent."}</p>
        <p className="notice notice-warn">{fr.preferences.notSaved}</p>
        <button type="button" className="btn btn-block" onClick={() => { setAnswers({}); setStep(0); }}>
          {fr.preferences.restart}
        </button>
      </section>
    );
  }

  const q = QUESTIONS[step]!;
  const selected = answers[q.id] ?? [];
  const toggle = (value: string) => {
    setAnswers((a) => {
      const cur = a[q.id] ?? [];
      const next = q.multiple ? (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]) : [value];
      return { ...a, [q.id]: next };
    });
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); setStep(step + 1); }}>
      <p className="muted" id="pref-step">{fr.preferences.step(step + 1, QUESTIONS.length)}</p>
      <div
        className="progress"
        role="progressbar"
        aria-labelledby="pref-step"
        aria-valuemin={1}
        aria-valuemax={QUESTIONS.length}
        aria-valuenow={step + 1}
      >
        <span className={`w-${Math.round(((step + 1) / QUESTIONS.length) * 6)}`} />
      </div>
      <fieldset className="choices">
        <legend>
          <h2 ref={headingRef} tabIndex={-1}>{q.title}</h2>
          {q.multiple && <span className="muted">{fr.preferences.multiple}</span>}
        </legend>
        {q.options.map((o) => (
          <label key={o.value} className="choice">
            <input
              type={q.multiple ? "checkbox" : "radio"}
              name={q.id}
              value={o.value}
              checked={selected.includes(o.value)}
              onChange={() => toggle(o.value)}
            />
            {o.label}
          </label>
        ))}
      </fieldset>
      <div className="sticky-actions">
        <button type="submit" className="btn btn-primary btn-block" disabled={selected.length === 0}>
          {step === QUESTIONS.length - 1 ? fr.preferences.finish : fr.preferences.next}
        </button>
        <div className="quiz-secondary">
          <button type="button" className="btn-link" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
            {fr.preferences.back}
          </button>
          <button type="button" className="btn-link" onClick={() => setStep(step + 1)}>
            {fr.preferences.skip}
          </button>
        </div>
      </div>
    </form>
  );
}
