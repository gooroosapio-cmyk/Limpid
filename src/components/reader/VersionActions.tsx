"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fr } from "@/lib/i18n/fr";

type Variation = "simpler" | "other_example";

/** « Plus simple » / « Un autre exemple » : demande une nouvelle version du rapport. */
export function VersionActions({ reportId, disabled }: { reportId: string; disabled: boolean }) {
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
        body: JSON.stringify({ variation, idempotency_key: keys.current[variation] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.message === "string" ? data.message : fr.versions.failed);
      // La page affiche alors la préparation en cours, puis la nouvelle version.
      router.refresh();
    } catch (err) {
      setError((err as Error).message || fr.versions.failed);
      setPending(null);
      delete keys.current[variation];
    }
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => ask("simpler")} disabled={disabled || !!pending}>
        {pending === "simpler" ? fr.versions.asking : fr.reader.simpler}
      </button>
      <button type="button" className="btn" onClick={() => ask("other_example")} disabled={disabled || !!pending}>
        {pending === "other_example" ? fr.versions.asking : fr.reader.otherExample}
      </button>
      {error && <p className="notice notice-warn reader-actions-error" role="alert">{error}</p>}
    </>
  );
}
