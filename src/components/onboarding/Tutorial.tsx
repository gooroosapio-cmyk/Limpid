"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { finishTutorial } from "@/app/bienvenue/actions";
import { Icon, type IconName } from "@/components/Icon";
import { Illustration } from "@/components/Illustration";
import { Wordmark } from "@/components/Logo";
import { useT } from "@/lib/i18n/client";

const ICONS: IconName[] = ["plus-circle", "quiz-v4", "chat"];

/**
 * Tutoriel : Importer → Ouvrir Présentation/QCM → Poser une question. Aucun import ni dépense
 * imposés ; la fin ou le passage est mémorisé (il ne revient plus de lui-même).
 */
export function Tutorial() {
  const t = useT();
  const u = t.v4.tutorial;
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const title = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const total = u.steps.length;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    title.current?.focus();
  }, [step]);

  function leave(to: string) {
    start(async () => {
      await finishTutorial();
      router.push(to);
      router.refresh();
    });
  }

  const [heading, text] = u.steps[step]!;
  const last = step === total - 1;
  return (
    <section className="onboarding tutorial" aria-labelledby="tuto-title">
      <header className="onboarding-head">
        <Wordmark height={26} />
        <button type="button" className="btn-link" disabled={pending} onClick={() => leave("/")}>{u.skip}</button>
      </header>

      <p className="eyebrow">{u.title}</p>
      <Illustration name="import" fallback="lumiere" className="tutorial-art" eager />

      <ol className="tutorial-steps">
        {u.steps.map(([h], i) => (
          <li key={h} className={i === step ? "on" : i < step ? "past" : ""} aria-current={i === step ? "step" : undefined}>
            <span className="tutorial-num" aria-hidden="true">{i < step ? <Icon name="check" size={16} /> : i + 1}</span>
            <span className="sr-only">{h}</span>
          </li>
        ))}
      </ol>

      <div className="tutorial-card">
        <span className="choice-icon" aria-hidden="true"><Icon name={ICONS[step]!} size={20} /></span>
        <div>
          <p className="meta" aria-live="polite">{u.stepOf(step + 1, total)}</p>
          <h1 id="tuto-title" ref={title} tabIndex={-1}>{heading}</h1>
          <p>{text}</p>
        </div>
      </div>

      <div className="onboarding-actions">
        {last ? (
          <>
            <button type="button" className="btn btn-primary btn-block" disabled={pending} onClick={() => leave("/ajouter")}>
              {u.start} <Icon name="arrow" />
            </button>
            <button type="button" className="btn btn-block" disabled={pending} onClick={() => leave("/")}>{u.later}</button>
          </>
        ) : (
          <button type="button" className="btn btn-primary btn-block" onClick={() => setStep(step + 1)}>
            {u.next} <Icon name="arrow" />
          </button>
        )}
        {step > 0 && (
          <div className="onboarding-secondary">
            <button type="button" className="btn-link" onClick={() => setStep(step - 1)}>
              <Icon name="back" size={18} /> {u.back}
            </button>
            <span />
          </div>
        )}
      </div>
    </section>
  );
}
