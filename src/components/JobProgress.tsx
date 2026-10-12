"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import { isActiveJob } from "@/lib/jobs/state";
import { RecoveryState } from "@/components/jobs/RecoveryState";
import { BookAnimation } from "@/components/jobs/BookAnimation";
import { PHASE_OF_STAGE } from "@/lib/jobs/phases";

interface JobView {
  id?: string;
  status: string;
  stage: string | null;
  error_code: string | null;
  recoverable?: boolean | null;
  attempts?: number;
  progress?: { chapters_done?: number; chapters_total?: number } | null;
  /** Publication progressive : une version lisible existe déjà (chapitre 1 au moins). */
  readable?: boolean;
}

const KIND: Record<string, string> = { pdf: "PDF", docx: "DOCX", txt: "TXT", paste: "Texte", url: "Lien", png: "Image", jpeg: "Image", webp: "Image" };

/** Phases affichées (planche 01), dérivées de l'étape réelle de la tâche : jamais du temps écoulé. */
const STEP_OF_STAGE = PHASE_OF_STAGE;

/**
 * Suit la génération (prompt « Fluidité », § 3 et § 4). Le serveur exécute, la page observe :
 * sondage léger seulement quand la page est visible, avec un délai qui s'allonge ; une
 * observation coupée affiche « Suivi momentanément indisponible », jamais un faux échec.
 * Publication progressive : dès que le premier chapitre est lisible, la page s'ouvre sur le cours.
 */
export function JobProgress({ reportId, initial, compact = false, partial = false, doc }: { reportId: string; initial: JobView; compact?: boolean; partial?: boolean; doc?: { title: string; kind: string | null; pages: number | null } }) {
  const t = useT();
  const f = t.fluid.tracker;
  const [job, setJob] = useState(initial);
  const [lost, setLost] = useState(false);
  const router = useRouter();
  const active = isActiveJob(job.status);

  useEffect(() => {
    if (!active) return;
    let ticks = 0;
    let wait = 2_500;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const tick = async () => {
      timer = null;
      if (stopped) return;
      // Page masquée : aucun sondage ; le worker continue sur le serveur.
      if (document.visibilityState === "hidden") return;
      const res = await fetch(`/api/reports/${reportId}`, { cache: "no-store" }).catch(() => null);
      if (stopped) return;
      if (!res?.ok) {
        setLost(true);
        wait = Math.min(wait * 1.5, 15_000);
      } else {
        setLost(false);
        const next: JobView = await res.json();
        setJob(next);
        ticks++;
        wait = Math.min(wait + 500, 6_000);
        if (next.status === "succeeded" || next.status === "incomplete_check") router.refresh();
        // Premier chapitre lisible : on ouvre le cours ; puis un rafraîchissement de temps en temps.
        else if (next.readable && (!compact || (partial && ticks % 4 === 0))) router.refresh();
      }
      timer = setTimeout(tick, wait);
    };
    const onVisible = () => {
      document.documentElement.classList.toggle("is-hidden", document.visibilityState === "hidden");
      if (document.visibilityState === "visible" && !timer) void tick();
    };
    timer = setTimeout(tick, wait);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      document.documentElement.classList.remove("is-hidden");
      window.removeEventListener("online", onVisible);
    };
  }, [active, reportId, router, compact, partial]);

  const step = job.status === "queued" ? 0 : (STEP_OF_STAGE[job.stage ?? ""] ?? 0);
  const done = job.progress?.chapters_done;
  const total = job.progress?.chapters_total;
  const counted = typeof done === "number" && typeof total === "number" && total > 0;

  // Relance automatique programmée : les étapes validées restent affichées comme terminées.
  if (job.status === "retrying") return <RecoveryState reportId={reportId} job={job} compact={compact} readable={!!job.readable} />;
  if (!active) return <RecoveryState reportId={reportId} job={job} compact={compact} readable={!!job.readable} />;

  const detail = (i: number) => {
    if (i < step) return f.done;
    if (i > step) return f.todo;
    if (job.status === "queued") return f.queued;
    if (i === 1 && counted) return f.chapters(done!, total!);
    return f.current[i]!;
  };

  if (compact) {
    return (
      <div className="card prep-compact" role="status" aria-live="polite">
        <span className="loader-inline" aria-hidden="true"><span className="dot" /><span className="dot" /><span className="dot" /></span>
        <p><b>{partial ? t.prep.moreChapters : t.prep.newVersion}</b> · {counted && step === 1 ? f.chapters(done!, total!) : t.fluid.phases[step]}</p>
      </div>
    );
  }

  return (
    <div className="gt">
      {doc && (
        <div className="gt-doc">
          <span className="gt-doc-icon" aria-hidden="true"><Icon name="file" size={24} /></span>
          <span className="gt-doc-text">
            <b>{doc.title}</b>
            <small>{[doc.kind ? (KIND[doc.kind] ?? doc.kind.toUpperCase()) : null, doc.pages ? t.added.pageCount(doc.pages) : null].filter(Boolean).join(" · ")}</small>
          </span>
        </div>
      )}
      <div className="gt-visual"><BookAnimation /></div>
      <h1 className="gt-title">{f.title}</h1>
      <p className="gt-step">{f.stepOf(step + 1, 4)}</p>
      {/* Annonce des changements d'étape seulement (pas de chaque compteur). */}
      <p className="sr-only" role="status" aria-live="polite">{t.fluid.phases[step]}</p>
      <ol className="fl-steps gt-steps">
        {t.fluid.phases.map((label, i) => {
          const state = i < step ? "done" : i === step ? "current" : "todo";
          return (
            <li key={label} className={`fl-step is-${state}`} aria-current={state === "current" ? "step" : undefined}>
              <span className="fl-step-mark" aria-hidden="true">{state === "done" ? <Icon name="check" size={16} /> : i + 1}</span>
              <span>
                <strong>{label}</strong>
                <small>{detail(i)}</small>
                {state === "current" && (counted && i === 1 ? (
                  <progress className="gt-progress" value={done} max={total} aria-label={label} />
                ) : (
                  <span className="gt-bar is-indeterminate" aria-hidden="true"><span /></span>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
      {lost ? (
        <p className="fl-info gt-note" role="status"><Icon name="cloud" size={20} /> <span>{typeof navigator !== "undefined" && !navigator.onLine ? f.offline : f.trackingLost}</span></p>
      ) : (
        <p className="fl-good gt-note"><Icon name="check-circle" size={20} /> <span>{job.status === "queued" ? f.queuedNote : f.canClose}</span></p>
      )}
      <Link href="/bibliotheque" className="btn btn-primary btn-block">{f.continue}</Link>
      <Link href="/bibliotheque?vue=preparations" className="btn-link gt-detail">{f.detail}</Link>
    </div>
  );
}
