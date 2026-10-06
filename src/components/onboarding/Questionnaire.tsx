"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { finishOnboarding, saveOnboardingStep, skipOnboardingStep } from "@/app/bienvenue/actions";
import { Icon, type IconName } from "@/components/Icon";
import { Wordmark } from "@/components/Logo";
import { useT } from "@/lib/i18n/client";
import { ACQUISITION_CHOICES, DOC_CHOICES, FAMILIARITY_CHOICES, GOAL_CHOICES, MODE_CHOICES, STEPS } from "@/lib/onboarding";

const GOAL_ICONS: Record<string, IconName> = { comprendre: "book", resumer: "file", reviser: "learning", appliquer: "settings", decider: "bars" };
const MODE_ICONS: Record<string, IconName> = { tres_simple: "bulb", claire: "book", resume: "file", revision: "quiz-v4" };
const FAMILIARITY_ICONS: Record<string, IconName> = { aucune: "spark", bases: "layers", maitrise: "check" };
const MAX_DOCS = 3;

interface Answers {
  goal: string | null;
  mode: string | null;
  familiarity: string | null;
  docs: string[];
  acquisition: string | null;
}

/** Questionnaire de première connexion : un écran par question, Retour / Continuer / Passer. */
export function Questionnaire({ initialStep, initial, review }: { initialStep: number; initial: Answers; review: boolean }) {
  const t = useT();
  const o = t.v4.onboarding;
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [answers, setAnswers] = useState<Answers>(initial);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const title = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  // Le titre reçoit le focus à chaque changement d'étape (pas au premier affichage).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    title.current?.focus();
  }, [step]);

  const q = [o.q1, o.q2, o.q3, o.q4, o.q5][step - 1]!;
  const value: string | string[] | null =
    step === 1 ? answers.goal : step === 2 ? answers.mode : step === 3 ? answers.familiarity : step === 4 ? answers.docs : answers.acquisition;
  const answered = Array.isArray(value) ? value.length > 0 : !!value;

  function done() {
    start(async () => {
      const r = await finishOnboarding();
      if (!r.ok) return setError(true);
      router.push(review ? "/compte" : "/bienvenue/tutoriel");
      router.refresh();
    });
  }

  function advance(save: boolean) {
    setError(false);
    start(async () => {
      const r = save ? await saveOnboardingStep({ step, value }) : await skipOnboardingStep(step);
      if (!r.ok) return setError(true);
      if (step < STEPS) setStep(step + 1);
      else done();
    });
  }

  const set = (patch: Partial<Answers>) => setAnswers((a) => ({ ...a, ...patch }));

  return (
    <section className="onboarding" aria-labelledby="onb-title">
      <header className="onboarding-head">
        <Wordmark height={26} />
        <div className="onboarding-progress">
          <ol className="onboarding-dots" aria-hidden="true">
            {Array.from({ length: STEPS }, (_, i) => <li key={i} className={i + 1 === step ? "on" : i + 1 < step ? "past" : ""} />)}
          </ol>
          <p className="meta" aria-live="polite">{o.stepOf(step, STEPS)}</p>
        </div>
      </header>

      <h1 id="onb-title" ref={title} tabIndex={-1}>{q.title}</h1>
      <p className="onboarding-lede">{q.lede}{step === 5 && <> · {o.optional}</>}</p>

      <fieldset className="choices" aria-describedby={step === 4 ? "onb-max" : undefined}>
        <legend className="sr-only">{q.title}</legend>
        {step === 1 && GOAL_CHOICES.map((c) => <Choice key={c} name="goal" icon={GOAL_ICONS[c]!} label={o.goals[c]![0]} desc={o.goals[c]![1]} checked={answers.goal === c} onChange={() => set({ goal: c })} />)}
        {step === 2 && MODE_CHOICES.map((c) => <Choice key={c} name="mode" icon={MODE_ICONS[c]!} label={o.modes[c]![0]} desc={o.modes[c]![1]} checked={answers.mode === c} onChange={() => set({ mode: c })} />)}
        {step === 3 && FAMILIARITY_CHOICES.map((c) => <Choice key={c} name="familiarity" icon={FAMILIARITY_ICONS[c]!} label={o.familiarity[c]![0]} desc={o.familiarity[c]![1]} checked={answers.familiarity === c} onChange={() => set({ familiarity: c })} />)}
        {step === 4 &&
          DOC_CHOICES.map((c) => {
            const on = answers.docs.includes(c);
            return (
              <Choice
                key={c}
                multiple
                name="docs"
                label={o.docs[c]!}
                checked={on}
                disabled={!on && answers.docs.length >= MAX_DOCS}
                onChange={() => set({ docs: on ? answers.docs.filter((d) => d !== c) : [...answers.docs, c].slice(0, MAX_DOCS) })}
              />
            );
          })}
        {step === 5 && ACQUISITION_CHOICES.map((c) => <Choice key={c} name="acquisition" label={o.acquisition[c]!} checked={answers.acquisition === c} onChange={() => set({ acquisition: c })} />)}
      </fieldset>
      {step === 4 && <p id="onb-max" className="meta">{o.pickUpTo(MAX_DOCS)}</p>}

      {error && <p className="field-error" role="alert">{o.saveFailed}</p>}

      <div className="onboarding-actions">
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={pending || (!answered && step < STEPS)}
          onClick={() => (answered ? advance(true) : advance(false))}
        >
          {step === STEPS ? o.finish : o.next} <Icon name="arrow" />
        </button>
        <div className="onboarding-secondary">
          {step > 1 ? (
            <button type="button" className="btn-link" disabled={pending} onClick={() => setStep(step - 1)}>
              <Icon name="back" size={18} /> {o.back}
            </button>
          ) : <span />}
          {step < STEPS && (
            <button type="button" className="btn-link" disabled={pending} onClick={() => advance(false)}>{o.skip}</button>
          )}
        </div>
      </div>
    </section>
  );
}

function Choice({
  name,
  label,
  desc,
  icon,
  checked,
  disabled = false,
  multiple = false,
  onChange,
}: {
  name: string;
  label: string;
  desc?: string;
  icon?: IconName;
  checked: boolean;
  disabled?: boolean;
  multiple?: boolean;
  onChange: () => void;
}) {
  return (
    <label className={`choice${checked ? " on" : ""}${disabled ? " off" : ""}`}>
      {icon && <span className="choice-icon" aria-hidden="true"><Icon name={icon} size={20} /></span>}
      <span className="choice-text">
        <b>{label}</b>
        {desc && <small>{desc}</small>}
      </span>
      <input type={multiple ? "checkbox" : "radio"} name={name} checked={checked} disabled={disabled} onChange={onChange} />
    </label>
  );
}
