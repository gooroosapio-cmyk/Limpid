"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { InsufficientCreditsState } from "@/components/jobs/InsufficientCreditsState";
import { walletChanged } from "@/components/billing/wallet-store";
import { apiMessage } from "@/lib/i18n/api";
import { useT } from "@/lib/i18n/client";
import { canRetryNow } from "@/lib/library/retry";
import { isRecoverable } from "@/lib/jobs/retry-policy";
import { PHASE_OF_STAGE } from "@/lib/jobs/phases";

export interface RecoveryJob {
  id?: string;
  status: string;
  stage: string | null;
  error_code: string | null;
  recoverable?: boolean | null;
  attempts?: number;
}

const UNREADABLE = new Set(["ocr_unreadable", "ocr_source_missing", "source_missing"]);

/**
 * Échec ou relance d'une génération (planche 03, prompt § 6) : le document, les réglages et les
 * étapes validées sont conservés ; la reprise relance la même tâche, sans réimport.
 */
export function RecoveryState({ reportId, job, compact = false, readable = false }: { reportId: string; job: RecoveryJob; compact?: boolean; readable?: boolean }) {
  const t = useT();
  const f = t.fluid.recovery;
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<{ needed: number; available: number; topup: string | null } | null>(null);

  const code = job.error_code ?? "unknown";
  const retrying = job.status === "retrying";
  const unreadable = UNREADABLE.has(code);
  const recoverable = !unreadable && job.status !== "cancelled" && (job.recoverable ?? isRecoverable(code));
  const later = recoverable && !canRetryNow(code);
  const failedPhase = PHASE_OF_STAGE[job.stage ?? ""] ?? 0;

  async function resume() {
    if (busy) return;
    setBusy(true);
    setError(null);
    // Une clé par geste : un double toucher ou un accusé perdu ne relance pas deux fois.
    key.current ??= crypto.randomUUID();
    const res = await fetch(`/api/reports/${reportId}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotency_key: key.current }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { billing?: { needed?: number; available?: number; topup?: string | null } };
    walletChanged();
    if (res?.status === 402 && body.billing) {
      setCredits({ needed: body.billing.needed ?? 0, available: body.billing.available ?? 0, topup: body.billing.topup ?? null });
      setBusy(false);
      return;
    }
    if (!res?.ok) {
      key.current = null;
      setBusy(false);
      setError(res ? apiMessage(t, body, f.failed) : f.offline);
      return;
    }
    router.refresh();
  }

  if (credits) return <InsufficientCreditsState needed={credits.needed} available={credits.available} topup={credits.topup} />;

  const title = retrying ? f.retryingTitle : unreadable ? f.unreadableTitle : recoverable ? f.title : f.finalTitle;
  const lede = retrying ? f.retryingLede : unreadable ? (t.jobErrors[code] ?? f.unreadableLede) : recoverable ? f.lede : (t.jobErrors[code] ?? t.jobErrors.unknown);

  return (
    <section className={`fl-card fl-recovery${compact ? " is-compact" : ""}${retrying ? " is-retrying" : ""}`} aria-labelledby={`fl-rec-${reportId}`}>
      <div className="fl-recovery-head">
        <span className={`fl-badge${retrying ? " is-calm" : ""}`} aria-hidden="true"><Icon name={retrying ? "refresh" : unreadable ? "file" : "refresh"} size={compact ? 22 : 28} /></span>
        <div>
          <h2 id={`fl-rec-${reportId}`} role={retrying ? "status" : "alert"}>{title}</h2>
          <p className="muted">{lede}</p>
        </div>
      </div>

      {!compact && !unreadable && (
        <ol className="fl-steps">
          {t.fluid.phases.map((label, i) => {
            const state = i < failedPhase ? "done" : i === failedPhase ? "resume" : "todo";
            return (
              <li key={label} className={`fl-step is-${state}`}>
                <span className="fl-step-mark" aria-hidden="true">{state === "done" ? <Icon name="check" size={16} /> : i + 1}</span>
                <span>
                  <strong>{state === "resume" && !retrying ? f.toResume(label) : label}</strong>
                  <small>{state === "done" ? f.done : state === "resume" ? (retrying ? f.inProgress : f.toDo) : f.toDo}</small>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {recoverable && !retrying && !later && <p className="fl-good"><Icon name="check-circle" size={20} /> <span>{f.noExtra}</span></p>}
      {later && <p className="muted">{t.v4.library.retryLaterNote}</p>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}

      <div className="fl-actions">
        {recoverable && !retrying && !later && (
          <button type="button" className={`btn btn-primary btn-block${busy ? " busy" : ""}`} disabled={busy} aria-busy={busy} onClick={resume}>
            {busy ? f.resuming : f.resume}
          </button>
        )}
        {unreadable && <Link href="/" className="btn btn-primary btn-block">{f.replace}</Link>}
        {unreadable && readable && <Link href={`/rapports/${reportId}`} className="btn btn-block">{f.openPartial}</Link>}
        {!recoverable && !unreadable && <Link href="/" className="btn btn-primary btn-block">{t.prep.addAgain}</Link>}
        {!compact && <Link href="/bibliotheque" className="btn btn-block">{t.fluid.backToLibrary}</Link>}
      </div>

      {!retrying && (
        <details className="fl-details">
          <summary><Icon name="chevron" size={18} /> {f.details}</summary>
          <dl>
            <div><dt>{f.code}</dt><dd><code>{code}</code></dd></div>
            {job.id && <div><dt>{f.reference}</dt><dd><code>{job.id.slice(0, 8)}</code></dd></div>}
            {typeof job.attempts === "number" && job.attempts > 0 && <div><dt>{f.attempts}</dt><dd>{job.attempts}</dd></div>}
          </dl>
        </details>
      )}
    </section>
  );
}
