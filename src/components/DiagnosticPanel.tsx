"use client";

import { useActionState } from "react";
import { runDiagnosticAction, type DiagnosticState } from "@/app/admin/actions";
import { useT } from "@/lib/i18n/client";

/** Diagnostic de l'environnement de production, lancé à la demande par l'administrateur. */
export function DiagnosticPanel() {
  const t = useT();
  const [state, action, pending] = useActionState<DiagnosticState, FormData>(runDiagnosticAction, { checks: null, at: null });
  return (
    <div>
      <form action={action} className="admin-form">
        <label className="consent">
          <input type="checkbox" name="gemini" />
          <span>{t.admin.diagGemini}</span>
        </label>
        <button type="submit" className="btn" disabled={pending}>{pending ? t.admin.diagRunning : t.admin.diagRun}</button>
      </form>
      <div aria-live="polite">
        {state.checks && (
          <ul className="diag-list">
            {state.checks.map((c) => (
              <li key={c.name} className={c.ok ? "diag-ok" : "diag-ko"}>
                <span className="sr-only">{c.ok ? t.admin.diagOk : t.admin.diagKo} : </span>
                <strong>{c.name}</strong> — {c.detail}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
