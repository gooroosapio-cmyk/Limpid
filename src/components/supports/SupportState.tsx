"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { InsufficientCreditsState } from "@/components/jobs/InsufficientCreditsState";
import { walletChanged } from "@/components/billing/wallet-store";
import { apiMessage } from "@/lib/i18n/api";
import { useT } from "@/lib/i18n/client";
import type { SupportStatus } from "@/lib/supports/load";
import type { DerivedSupport } from "@/lib/supports/supports";

/**
 * État compact d'un support dérivé (§ 4) : préparation avec compteur réel, attente du cours,
 * échec avec reprise de ce seul support, ou invitation à l'ajouter. Les supports prêts restent
 * consultables ailleurs ; aucun spinner global.
 */
export function SupportState({
  reportId,
  support,
  status,
  progress,
  cost = null,
  compact = false,
}: {
  reportId: string;
  support: DerivedSupport;
  status: SupportStatus;
  progress: { done: number; total: number } | null;
  /** Coût annoncé avant le lancement (crédits), calculé par le serveur. */
  cost?: number | null;
  compact?: boolean;
}) {
  const t = useT();
  const s = t.supports;
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [credits, setCredits] = useState<{ needed: number; available: number; topup: string | null } | null>(null);

  async function request() {
    if (busy) return;
    setBusy(true);
    setError(null);
    key.current ??= crypto.randomUUID();
    const res = await fetch(`/api/reports/${reportId}/supports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ support, idempotency_key: key.current }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { billing?: { needed?: number; available?: number; topup?: string | null } };
    walletChanged();
    setBusy(false);
    if (res?.status === 402 && body.billing) {
      setCredits({ needed: body.billing.needed ?? 0, available: body.billing.available ?? 0, topup: body.billing.topup ?? null });
      return;
    }
    if (!res?.ok) {
      key.current = null;
      setError(res ? apiMessage(t, body, s.add.failed) : s.add.failed);
      return;
    }
    setQueued(true);
    router.refresh();
  }

  if (credits) return <InsufficientCreditsState needed={credits.needed} available={credits.available} topup={credits.topup} />;
  if (status === "ready") return null;
  const title = support === "carte" ? t.supports.tabs.carte : t.supports.review.flashcards;
  if (status === "preparing" || status === "waiting" || queued) {
    return (
      <div className="support-state" role="status">
        <h3><Icon name="hourglass" size={18} /> {title} · {status === "waiting" ? s.status.waiting : s.status.preparing}</h3>
        {progress && progress.total > 0 && (
          <>
            <progress className="gt-progress" max={progress.total} value={progress.done} />
            <p>{s.status.progress(progress.done, progress.total)}</p>
          </>
        )}
        {queued && <p>{s.add.queued}</p>}
      </div>
    );
  }
  const failed = status === "failed";
  return (
    <div className={`support-state${failed ? " is-failed" : ""}`}>
      <h3><Icon name={failed ? "alert" : support === "carte" ? "mindmap" : "cards"} size={18} /> {failed ? `${title} · ${s.status.failed}` : support === "carte" ? s.add.carte : s.add.flashcards}</h3>
      {!compact && <p>{support === "carte" ? s.add.carteSub : s.add.flashcardsSub}</p>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <button type="button" className={`btn${failed ? "" : " btn-primary"}${busy ? " busy" : ""}`} disabled={busy} aria-busy={busy} onClick={request}>
        <Icon name={failed ? "refresh" : "plus"} size={18} /> {busy ? s.add.adding : failed ? s.add.retry : support === "carte" ? s.add.carte : s.add.flashcards}
        {cost !== null && !busy && <span className="support-cost"> · {t.add.v2.estimate(cost)}</span>}
      </button>
    </div>
  );
}
