"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { apiMessage } from "@/lib/i18n/api";
import { useT } from "@/lib/i18n/client";

/** « Expliquer mon document » : lancement direct, réglages déduits côté serveur (kit V3, écran 03). */
export function ExplainDocument({ sourceId }: { sourceId: string }) {
  const t = useT();
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
      throw new Error(apiMessage(t, data, t.added.failed));
    } catch (e) {
      setError((e as Error).message || t.added.failed);
      setPending(false);
    }
  }

  return (
    <>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <button type="button" className={`btn btn-primary btn-block${pending ? " busy" : ""}`} onClick={explain} disabled={pending} aria-busy={pending}>
        <Icon name="spark" /> {pending ? t.added.explaining : t.added.explain}
      </button>
      <p className="center muted small">{t.added.cost}</p>
      <p className="center"><Link href="/" className="btn-link">{t.added.change}</Link></p>
    </>
  );
}
