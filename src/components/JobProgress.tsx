"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { LoaderBook } from "@/components/LoaderBook";
import type { Dict } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { isActiveJob } from "@/lib/jobs/state";
import { RecoveryState } from "@/components/jobs/RecoveryState";

interface JobView {
  id?: string;
  status: string;
  stage: string | null;
  error_code: string | null;
  recoverable?: boolean | null;
  attempts?: number;
  /** Publication progressive : une version lisible existe déjà (chapitre 1 au moins). */
  readable?: boolean;
}


/** Étapes du kit (4), dérivées de l'étape réelle de la tâche : jamais du temps écoulé. */
/** Étapes affichées (V4) : lecture, explications, visuels, vérification et mise en page. */
const STEP_OF_STAGE: Record<string, number> = {
  validation: 0,
  extraction: 0,
  comprehension: 1,
  verification: 1,
  plan: 1,
  explication: 1,
  illustrations: 2,
  mise_en_page: 3,
};

function currentDetail(step: number, job: JobView, t: Dict): string {
  if (job.status === "queued") return t.prep.queued;
  return t.prep.steps[step]!.current;
}

/**
 * Suit la génération (interrogation légère). Publication progressive : dès que le premier
 * chapitre est lisible, la page s'ouvre sur le cours ; ensuite, elle se recharge pour faire
 * apparaître les chapitres suivants, puis une dernière fois quand le cours est complet.
 */
export function JobProgress({ reportId, initial, compact = false, partial = false }: { reportId: string; initial: JobView; compact?: boolean; partial?: boolean }) {
  const t = useT();
  const [job, setJob] = useState(initial);
  const router = useRouter();
  const active = isActiveJob(job.status);

  useEffect(() => {
    if (!active) return;
    let ticks = 0;
    const t = setInterval(async () => {
      const res = await fetch(`/api/reports/${reportId}`, { cache: "no-store" });
      if (!res.ok) return;
      const next: JobView = await res.json();
      setJob(next);
      ticks++;
      if (next.status === "succeeded" || next.status === "incomplete_check") router.refresh();
      // Premier chapitre lisible : on ouvre le cours ; puis un rafraîchissement toutes les 15 s.
      else if (next.readable && (!compact || (partial && ticks % 5 === 0))) router.refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [active, reportId, router, compact, partial]);

  const step = job.status === "queued" ? 0 : (STEP_OF_STAGE[job.stage ?? ""] ?? 0);

  // Relance automatique programmée : les étapes validées restent affichées comme terminées.
  if (job.status === "retrying") return <RecoveryState reportId={reportId} job={job} compact={compact} readable={!!job.readable} />;

  if (active && compact) {
    return (
      <div className="card prep-compact" role="status" aria-live="polite">
        <span className="loader-inline" aria-hidden="true"><span className="dot" /><span className="dot" /><span className="dot" /></span>
        <p><b>{partial ? t.prep.moreChapters : t.prep.newVersion}</b> · {t.prep.steps[step]!.label}</p>
      </div>
    );
  }

  if (active) {
    const phase = t.prep.phases[step <= 0 ? 0 : step === 1 ? 1 : 2]!;
    return (
      <div className="prep">
        <LoaderBook />
        <div className="phase" key={phase.heading}>
          <h1>{phase.heading}</h1>
          <p className="lede">{phase.lede}</p>
        </div>
        <p className="sr-only" role="status" aria-live="polite">{t.prep.steps[step]!.label} : {currentDetail(step, job, t)}</p>
        <ol className="steps">
          {t.prep.steps.map((st, i) => {
            const state = i < step ? "done" : i === step ? "current" : "todo";
            return (
              <li key={st.label} className={`step step-${state}`} aria-current={state === "current" ? "step" : undefined}>
                <span className="step-mark" aria-hidden="true">{state === "done" ? <Icon name="check" size={16} /> : i + 1}</span>
                <span>
                  <strong>{st.label}</strong>
                  <span className="step-detail">
                    {state === "done" ? t.prep.done : state === "current" ? currentDetail(i, job, t) : t.prep.todo}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="muted">{t.prep.later}</p>
        <Link href="/" className="btn btn-block">{t.prep.home}</Link>
        <p className="prepare-foot">{t.prep.foot}</p>
      </div>
    );
  }

  return <RecoveryState reportId={reportId} job={job} compact={compact} readable={!!job.readable} />;}
