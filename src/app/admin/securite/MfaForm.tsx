"use client";

import { useActionState, useId } from "react";
import { useT } from "@/lib/i18n/client";
import { startEnroll, verifyCode, type MfaState } from "./actions";

function CodeForm({ state, action, pending, factorId }: { state: MfaState; action: (f: FormData) => void; pending: boolean; factorId?: string }) {
  const t = useT().admin;
  const id = useId();
  return (
    <form action={action} className="mfa-step">
      {factorId && <input type="hidden" name="factor_id" value={factorId} />}
      <label htmlFor={`${id}-code`}>{t.mfaCode}</label>
      <input id={`${id}-code`} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
      {state.message && <p className="notice notice-warn" role="alert">{state.message}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? t.mfaVerifying : t.mfaVerify}
      </button>
    </form>
  );
}

/** Saisie du code d'un facteur déjà configuré. */
export function MfaVerify() {
  const [state, action, pending] = useActionState<MfaState, FormData>(verifyCode, { status: "idle", message: "" });
  return <CodeForm state={state} action={action} pending={pending} />;
}

/** Configuration : QR code (ou clé), puis premier code pour confirmer. */
export function MfaEnroll() {
  const t = useT().admin;
  const [enroll, start, starting] = useActionState<MfaState, FormData>(startEnroll, { status: "idle", message: "" });
  const [state, verify, verifying] = useActionState<MfaState, FormData>(verifyCode, { status: "idle", message: "" });
  if (enroll.status !== "enrolling") {
    return (
      <form action={start} className="mfa-step">
        {enroll.message && <p className="notice notice-warn" role="alert">{enroll.message}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={starting}>
          {starting ? t.mfaStarting : t.mfaStart}
        </button>
      </form>
    );
  }
  return (
    <div className="mfa-step">
      <p>{t.mfaScan}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG en adresse data:, rien à optimiser */}
      <img src={enroll.qr} alt={t.mfaQrAlt} width={200} height={200} className="mfa-qr" />
      <details>
        <summary>{t.mfaSecretLabel}</summary>
        <code className="mfa-secret">{enroll.secret}</code>
      </details>
      <CodeForm state={state} action={verify} pending={verifying} factorId={enroll.factorId} />
    </div>
  );
}
