"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";

type Variation = "simpler" | "other_example";

/** « Plus simple » / « Un autre exemple » : demande une nouvelle version du rapport. */
export function VersionActions({
  reportId,
  disabled,
  sectionId,
}: {
  reportId: string;
  disabled: boolean;
  /** Réécrire une seule partie (sinon tout le rapport). */
  sectionId?: string;
}) {
  const t = useT();
  const [pending, setPending] = useState<Variation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keys = useRef<Partial<Record<Variation, string>>>({});
  const router = useRouter();

  async function ask(variation: Variation) {
    setPending(variation);
    setError(null);
    keys.current[variation] ??= crypto.randomUUID();
    try {
      const res = await fetch(`/api/reports/${reportId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variation, idempotency_key: keys.current[variation], ...(sectionId ? { section_id: sectionId } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.message === "string" ? data.message : t.versions.failed);
      // La page affiche alors la préparation en cours, puis la nouvelle version.
      router.refresh();
    } catch (err) {
      setError((err as Error).message || t.versions.failed);
      setPending(null);
      delete keys.current[variation];
    }
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => ask("simpler")} disabled={disabled || !!pending}>
        {pending === "simpler" ? t.versions.asking : t.reader.simpler}
      </button>
      <button type="button" className="btn" onClick={() => ask("other_example")} disabled={disabled || !!pending}>
        {pending === "other_example" ? t.versions.asking : t.reader.otherExample}
      </button>
      {error && <p className="notice notice-warn reader-actions-error" role="alert">{error}</p>}
    </>
  );
}
