"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { finishTutorial } from "@/app/bienvenue/actions";
import { Icon } from "@/components/Icon";
import { Illustration } from "@/components/Illustration";
import { Wordmark } from "@/components/Logo";
import { useT } from "@/lib/i18n/client";

/**
 * Kit V4 : présentation en un seul écran (deuxième et dernier écran du premier lancement),
 * trois gestes numérotés, « Commencer » ou « Plus tard ». Rejouable depuis Paramètres ; la fin
 * ou le report est mémorisé (il ne revient plus de lui-même).
 */
export function Tutorial() {
  const t = useT();
  const u = t.v4.tutorial;
  const router = useRouter();
  const [pending, start] = useTransition();

  function leave(to: string) {
    start(async () => {
      await finishTutorial();
      router.push(to);
      router.refresh();
    });
  }

  return (
    <section className="onboarding tutorial intro-v4" aria-labelledby="tuto-title">
      <header className="onboarding-head">
        <Wordmark height={26} />
        <div className="onboarding-progress">
          <ol className="onboarding-dots" aria-hidden="true"><li className="past" /><li className="on" /></ol>
          <p className="meta">{t.v4.onboarding.stepOf(2, 2)}</p>
        </div>
      </header>

      <h1 id="tuto-title" className="intro-title">{u.titleA}<br /><span>{u.titleB}</span></h1>
      <p className="intro-lede">{u.intro}</p>
      <Illustration name="bienvenue" fallback="lumiere" className="intro-art" eager />

      <ol className="intro-steps">
        {u.steps.map(([h, d], i) => (
          <li key={h}>
            <span className="intro-num" aria-hidden="true">{i + 1}</span>
            <span>
              <b>{h}</b>
              <small>{d}</small>
            </span>
          </li>
        ))}
      </ol>

      <div className="onboarding-actions">
        <button type="button" className="btn btn-primary btn-block" disabled={pending} onClick={() => leave("/")}>
          {u.begin} <Icon name="arrow" />
        </button>
        <button type="button" className="btn btn-block intro-later" disabled={pending} onClick={() => leave("/bibliotheque")}>{u.later}</button>
      </div>
    </section>
  );
}
