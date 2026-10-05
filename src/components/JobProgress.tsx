"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { LoaderBook } from "@/components/LoaderBook";
import { fr } from "@/lib/i18n/fr";

interface JobView {
  status: string;
  stage: string | null;
  error_code: string | null;
}

const ERRORS: Record<string, string> = {
  budget_monthly: "Le plafond mensuel de dépense IA est atteint.",
  budget_daily: "Le plafond quotidien de ce compte est atteint. Réessayez demain.",
  generation_disabled: "La génération est suspendue par l'administrateur.",
  provider_refused: "Le fournisseur IA a refusé de traiter ce contenu.",
  provider_unavailable: "Le fournisseur IA est indisponible pour le moment.",
  provider_rate_limited: "Le fournisseur IA limite les demandes. Réessayez dans quelques minutes.",
  provider_quota_exhausted: "Le quota quotidien gratuit de Gemini est atteint. Réessayez demain (ou activez la facturation Gemini).",
  provider_timeout: "Le fournisseur IA n'a pas répondu à temps.",
  provider_truncated: "La réponse du fournisseur IA était incomplète (document trop long ?).",
  ocr_unreadable: "Aucun texte lisible n'a été trouvé dans ce document.",
  ocr_source_missing: "Le fichier à lire n'est plus disponible. Envoyez-le à nouveau.",
};

/** Étapes du kit (4), dérivées de l'étape réelle de la tâche : jamais du temps écoulé. */
const STEP_OF_STAGE: Record<string, number> = {
  validation: 0,
  extraction: 0,
  comprehension: 1,
  explication: 2,
  verification: 3,
  illustrations: 3,
  mise_en_page: 3,
};

function currentDetail(step: number, job: JobView): string {
  if (job.status === "queued") return fr.prep.queued;
  if (job.stage === "illustrations") return fr.prep.illustrations;
  if (job.stage === "mise_en_page") return fr.prep.layout;
  return fr.prep.steps[step]!.current;
}

/** Suit la génération (interrogation légère), puis recharge la page quand le rapport est prêt. */
export function JobProgress({ reportId, initial, compact = false }: { reportId: string; initial: JobView; compact?: boolean }) {
  const [job, setJob] = useState(initial);
  const router = useRouter();
  const active = job.status === "queued" || job.status === "running";

  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/reports/${reportId}`, { cache: "no-store" });
      if (!res.ok) return;
      const next: JobView = await res.json();
      setJob(next);
      if (next.status === "succeeded" || next.status === "incomplete_check") router.refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [active, reportId, router]);

  const step = job.status === "queued" ? 0 : (STEP_OF_STAGE[job.stage ?? ""] ?? 0);

  if (active && compact) {
    return (
      <div className="card prep-compact" role="status" aria-live="polite">
        <span className="loader-inline" aria-hidden="true"><span className="dot" /><span className="dot" /><span className="dot" /></span>
        <p><b>{fr.prep.newVersion}</b> · {fr.prep.steps[step]!.label}</p>
      </div>
    );
  }

  if (active) {
    const phase = fr.prep.phases[step <= 0 ? 0 : step <= 2 ? 1 : 2]!;
    return (
      <div className="prep">
        <LoaderBook />
        <div className="phase" key={phase.heading}>
          <h1>{phase.heading}</h1>
          <p className="lede">{phase.lede}</p>
        </div>
        <p className="sr-only" role="status" aria-live="polite">{fr.prep.steps[step]!.label} : {currentDetail(step, job)}</p>
        <ol className="steps">
          {fr.prep.steps.map((st, i) => {
            const state = i < step ? "done" : i === step ? "current" : "todo";
            return (
              <li key={st.label} className={`step step-${state}`} aria-current={state === "current" ? "step" : undefined}>
                <span className="step-mark" aria-hidden="true">{state === "done" ? <Icon name="check" size={16} /> : i + 1}</span>
                <span>
                  <strong>{st.label}</strong>
                  <span className="step-detail">
                    {state === "done" ? fr.prep.done : state === "current" ? currentDetail(i, job) : fr.prep.todo}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="muted">{fr.prep.later}</p>
        <Link href="/" className="btn btn-block">{fr.prep.home}</Link>
        <p className="prepare-foot">{fr.prep.foot}</p>
      </div>
    );
  }

  const message = `${fr.reports.status[job.status] ?? job.status}${job.error_code ? ` : ${ERRORS[job.error_code] ?? "une erreur est survenue."}` : ""}`;
  if (compact) return <p className="notice notice-error" role="alert">{message}</p>;
  return (
    <div className="prep prep-error">
      <span className="icon-badge" aria-hidden="true"><Icon name="alert" size={30} /></span>
      <h1>{fr.prep.errorTitle}</h1>
      <p className="notice notice-error" role="alert">{message}</p>
      <p className="muted">{fr.prep.kept}</p>
      <div className="actions-row">
        <Link href="/" className="btn">{fr.prep.library}</Link>
        <Link href="/ajouter" className="btn btn-primary">{fr.prep.addAgain}</Link>
      </div>
    </div>
  );
}
