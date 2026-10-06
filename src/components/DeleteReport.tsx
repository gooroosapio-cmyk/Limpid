"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";

export function DeleteReport({ reportId }: { reportId: string }) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const router = useRouter();

  async function remove() {
    if (!window.confirm(t.reports.deleteConfirm)) return;
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
      {error && <p className="notice notice-warn" role="alert">{t.common.deleteFailed}</p>}
      <button type="button" className="btn btn-block" onClick={remove} disabled={pending}>
        {pending ? t.reports.deleting : t.reports.delete}
      </button>
    </div>
  );
}
