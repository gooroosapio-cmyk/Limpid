"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { STAGE_LABELS_FR, type JobStage } from "@/lib/jobs/state";
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

/** Étapes affichées (maquette « Votre rapport prend forme »), dérivées de l'étape réelle de la tâche. */
const STEPS: { label: string; detail: string; stages: string[] }[] = [
  { label: "Source vérifiée", detail: "Lecture et contrôle du document.", stages: ["validation", "extraction"] },
  { label: "Idées structurées", detail: "Repérage des informations et des extraits.", stages: ["comprehension"] },
  { label: "Sources contrôlées", detail: "Chaque affirmation relue face à son extrait.", stages: ["verification"] },
  { label: "Explications", detail: "Rédaction au niveau choisi.", stages: ["explication"] },
  { label: "Illustrations", detail: "Schémas et images libres de droits, si prévus.", stages: ["illustrations"] },
  { label: "Contrôle et mise en page", detail: "Vérification finale et mise en forme.", stages: ["mise_en_page"] },
];

/** Suit la génération (interrogation légère), puis recharge la page quand le rapport est prêt. */
export function JobProgress({ reportId, initial }: { reportId: string; initial: JobView }) {
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

  if (active) {
    const current = job.status === "queued" ? -1 : STEPS.findIndex((st) => st.stages.includes(job.stage ?? ""));
    const label = job.stage ? STAGE_LABELS_FR[job.stage as JobStage] : fr.reports.status.queued;
    return (
      <div className="card progress-card">
        <p className="progress-title"><strong>{fr.progress.title}</strong></p>
        <p className="sr-only" role="status" aria-live="polite">{label}</p>
        <ol className="steps">
          {STEPS.map((st, i) => {
            const state = i < current ? "done" : i === current ? "current" : "todo";
            return (
              <li key={st.label} className={`step step-${state}`} aria-current={state === "current" ? "step" : undefined}>
                <span className="step-mark" aria-hidden="true">{state === "done" ? "✓" : ""}</span>
                <span>
                  <strong>{st.label}</strong>
                  <span className="sr-only"> ({fr.progress.states[state]})</span>
                  <span className="step-detail">{st.detail}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="notice">{fr.progress.leave}</p>
        <Link href="/rapports" className="btn btn-block">{fr.progress.myReports}</Link>
      </div>
    );
  }
  return (
    <p className="notice notice-warn" role="alert">
      {fr.reports.status[job.status] ?? job.status}
      {job.error_code ? ` : ${ERRORS[job.error_code] ?? "une erreur est survenue."}` : ""}
    </p>
  );
}
