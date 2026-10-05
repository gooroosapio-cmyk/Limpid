"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { walletChanged } from "@/components/billing/wallet-store";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/shell/Toasts";
import { apiMessage } from "@/lib/i18n/api";
import { useT } from "@/lib/i18n/client";
import type { CoverView } from "@/lib/library/covers";
import { Cover } from "./Cover";

/** Étapes réelles du serveur (aucune durée simulée, aucun pourcentage). */
const STAGES = ["validation", "extraction", "comprehension", "explication", "verification", "mise_en_page"] as const;

interface RunningItem { id: string; title: string; cover: CoverView; sourceCount: number; stage: string | null }
interface FailedItem { id: string; title: string; cover: CoverView; sourceCount: number; reason: string }

function FailedCard({ item }: { item: FailedItem }) {
  const t = useT();
  const v = t.library.v2;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function retry() {
    setBusy(true);
    // Une clé par geste : un double appui ne relance pas deux préparations.
    const res = await fetch(`/api/reports/${item.id}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotency_key: `retry-${item.id}-${Math.floor(Date.now() / 60_000)}` }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    walletChanged();
    setBusy(false);
    if (!res?.ok) return toast(apiMessage(t, body, t.library.actionFailed), "error");
    toast(t.library.retried);
    router.refresh();
  }
  return (
    <li className="prep-failed">
      <Cover cover={item.cover} className="prep-thumb" />
      <div className="prep-failed-body">
        <h3>{item.title}</h3>
        <p className="status status-failed"><Icon name="alert" /> <span>{v.interrupted}</span></p>
        <p className="muted small">{item.reason}</p>
        <p className="muted small">{v.sourcesKept}</p>
        <div className="prep-actions">
          <button type="button" className={`btn btn-primary${busy ? " busy" : ""}`} disabled={busy} onClick={retry}>
            {busy ? t.library.retrying : t.library.retry}
          </button>
          <Link href={`/rapports/${item.id}`} className="btn">{v.details}</Link>
        </div>
      </div>
    </li>
  );
}

/**
 * Préparations (V2, écran 03) : deux filtres réels, « En cours » (étape serveur actuelle) et
 * « À vérifier » (échecs, avec Réessayer explicite). La navigation reste libre pendant le travail.
 */
export function Preparations({ running, failed, initialTab }: { running: RunningItem[]; failed: FailedItem[]; initialTab: "running" | "failed" }) {
  const t = useT();
  const p = t.library.v2.prep;
  const router = useRouter();
  const [tab, setTab] = useState<"running" | "failed">(initialTab);

  // Tant qu'une préparation tourne, la liste est relue toutes les 8 s (état serveur réel).
  useEffect(() => {
    if (running.length === 0) return;
    const id = setInterval(() => router.refresh(), 8_000);
    return () => clearInterval(id);
  }, [running.length, router]);

  return (
    <>
      <div className="page-title">
        <h1>{p.title}</h1>
        <p>{p.lede}</p>
      </div>
      <div className="utabs" role="tablist" aria-label={p.title}>
        <button type="button" role="tab" aria-selected={tab === "running"} onClick={() => setTab("running")}>
          {p.running}{running.length ? ` (${running.length})` : ""}
        </button>
        <button type="button" role="tab" aria-selected={tab === "failed"} onClick={() => setTab("failed")}>
          {p.toCheck}{failed.length ? ` (${failed.length})` : ""}
        </button>
      </div>

      {tab === "running" ? (
        running.length === 0 ? (
          <p className="muted">{p.noRunning}</p>
        ) : (
          <ul className="prep-list" role="tabpanel">
            {running.map((r) => {
              const index = Math.max(0, STAGES.indexOf((r.stage ?? "validation") as (typeof STAGES)[number]));
              return (
                <li key={r.id} className="prep-running">
                  <Link href={`/rapports/${r.id}`} className="prep-running-link">
                    <Cover cover={r.cover} className="prep-hero" />
                    <div className="prep-running-body">
                      <h2>{r.title}</h2>
                      <p className="prep-meta"><Icon name="layers" size={18} /> {t.library.v2.sources(r.sourceCount)}</p>
                      <ol className="prep-steps" aria-label={p.step(index + 1, STAGES.length)}>
                        {STAGES.map((s, i) => (
                          <li key={s} className={i < index ? "done" : i === index ? "current" : undefined} aria-current={i === index ? "step" : undefined}>
                            <span className="sr-only">{t.admin.stages[s] ?? s}</span>
                          </li>
                        ))}
                      </ol>
                      <p className="prep-stage">{t.admin.stages[STAGES[index]!] ?? STAGES[index]}</p>
                      <p className="muted small">{p.comeBack}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      ) : failed.length === 0 ? (
        <p className="muted">{p.noFailed}</p>
      ) : (
        <ul className="prep-list" role="tabpanel">
          {failed.map((f) => <FailedCard key={f.id} item={f} />)}
        </ul>
      )}

      <p className="prep-back">
        <Link href="/" className="btn-link"><Icon name="back" size={18} /> {p.back}</Link>
      </p>
    </>
  );
}
