"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { REFORMULATE_REASONS, type ReformulateReason } from "@/lib/engine/reasons";
import { useT } from "@/lib/i18n/client";

/**
 * « Essayer une autre formulation » (V4, § 11) : retour rapide à choix multiples et
 * commentaire facultatif ; produit une nouvelle version liée, sans écraser l'actuelle.
 */
export function ReformulatePanel({ reportId, onDone }: { reportId: string | null; onDone: () => void }) {
  const t = useT();
  const router = useRouter();
  const base = useId();
  const [reasons, setReasons] = useState<ReformulateReason[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID());

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!reportId || (!reasons.length && !comment.trim())) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variation: "reformulate", reasons, comment: comment.trim() || undefined, idempotency_key: key.current }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.message === "string" ? data.message : t.versions.failed);
      setDone(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      key.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }

  if (!reportId) return <p className="notice">{t.ask.unavailable}</p>;
  if (done)
    return (
      <div className="stagger">
        <p className="notice notice-ok" role="status">{t.lim.requested}</p>
        <button type="button" className="btn btn-block" onClick={onDone}>{t.lim.back}</button>
      </div>
    );
  return (
    <form onSubmit={send} className="stagger">
      <fieldset className="choices">
        <legend>{t.lim.reformulateIntro}</legend>
        {REFORMULATE_REASONS.map((r) => (
          <label key={r} className="choice">
            <input
              type="checkbox"
              checked={reasons.includes(r)}
              onChange={() => setReasons((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]))}
            />
            {t.lim.reasons[r]}
          </label>
        ))}
      </fieldset>
      <label htmlFor={`${base}-c`}>{t.lim.comment}</label>
      <textarea id={`${base}-c`} value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} />
      <p className="muted small">{t.lim.keptNote}</p>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <button type="submit" className={`btn btn-primary btn-block${busy ? " busy" : ""}`} disabled={busy || (!reasons.length && !comment.trim())}>
        {t.lim.reformulateSend}
      </button>
    </form>
  );
}
