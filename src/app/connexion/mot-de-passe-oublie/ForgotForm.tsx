"use client";

import { useActionState, useId } from "react";
import { useT } from "@/lib/i18n/client";
import { requestPasswordReset, type LoginState } from "../actions";

export function ForgotForm() {
  const t = useT();
  const [state, action, pending] = useActionState<LoginState, FormData>(requestPasswordReset, { status: "idle", message: "" });
  const base = useId();
  return (
    <form action={action} className="card" aria-describedby={`${base}-status`}>
      <label htmlFor={`${base}-email`}>{t.login.email}</label>
      <input id={`${base}-email`} name="email" type="email" autoComplete="username" inputMode="email" required />
      <p id={`${base}-status`} role="status" className={state.status === "error" ? "notice notice-warn" : state.message ? "notice" : "sr-only"}>
        {state.message}
      </p>
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? t.login.sending : t.login.forgotSubmit}
      </button>
    </form>
  );
}
