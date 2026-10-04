"use client";

import { useEffect, useState } from "react";
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
  provider_timeout: "Le fournisseur IA n'a pas répondu à temps.",
};

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
    const label = job.stage ? STAGE_LABELS_FR[job.stage as JobStage] : fr.reports.status.queued;
    return (
      <div className="card" role="status" aria-live="polite">
        <p><strong>{label}…</strong></p>
        <p className="muted">La génération prend en général moins d'une minute. Vous pouvez quitter cette page.</p>
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
