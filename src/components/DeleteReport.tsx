"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fr } from "@/lib/i18n/fr";

export function DeleteReport({ reportId }: { reportId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const router = useRouter();

  async function remove() {
    if (!window.confirm(fr.reports.deleteConfirm)) return;
    setPending(true);
    const res = await fetch(`/api/reports/${reportId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/bibliotheque");
      router.refresh();
    } else {
      setError(true);
      setPending(false);
    }
  }

  return (
    <div className="danger-zone">
      {error && <p className="notice notice-warn" role="alert">La suppression a échoué. Réessayez.</p>}
      <button type="button" className="btn btn-block" onClick={remove} disabled={pending}>
        {pending ? fr.reports.deleting : fr.reports.delete}
      </button>
    </div>
  );
}
