"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { fr } from "@/lib/i18n/fr";

/** « Expliquer mon document » : lancement direct, réglages déduits côté serveur (kit V3, écran 03). */
export function ExplainDocument({ sourceId }: { sourceId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID());
  const router = useRouter();

  async function explain() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: sourceId, idempotency_key: key.current }),
      });
      const data = await res.json().catch(() => ({}));
      const id = data.reportId ?? data.report_id;
      if (typeof id === "string") {
        router.push(`/rapports/${id}`);
        return;
      }
      throw new Error(typeof data.message === "string" ? data.message : fr.added.failed);
    } catch (e) {
      setError((e as Error).message || fr.added.failed);
      setPending(false);
    }
  }

  return (
    <>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <button type="button" className={`btn btn-primary btn-block${pending ? " busy" : ""}`} onClick={explain} disabled={pending} aria-busy={pending}>
        <Icon name="spark" /> {pending ? fr.added.explaining : fr.added.explain}
      </button>
      <p className="center muted small">{fr.added.cost}</p>
      <p className="center"><Link href="/ajouter" className="btn-link">{fr.added.change}</Link></p>
    </>
  );
}
