"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { setPassword, type PasswordState } from "./actions";

export function PasswordForm({ email }: { email: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<PasswordState, FormData>(setPassword, { status: "idle", message: "" });
  const [show, setShow] = useState(false);
  const base = useId();
  if (state.status === "saved") {
    return (
      <div className="card">
        <p className="notice" role="status">{t.login.saved}</p>
        <Link href="/" className="btn btn-primary btn-block">{t.login.continue}</Link>
      </div>
    );
  }
  return (
    <form action={action} className="card" aria-describedby={`${base}-rules`}>
      {/* Champ d'identifiant caché : aide les gestionnaires de mots de passe à associer le compte. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <label htmlFor={`${base}-pw`}>{t.login.newPassword}</label>
      <div className="password-field">
        <input id={`${base}-pw`} name="password" type={show ? "text" : "password"} autoComplete="new-password" required minLength={10} maxLength={128} />
        <button type="button" className="password-toggle" aria-pressed={show} aria-controls={`${base}-pw`} onClick={() => setShow((s) => !s)}>
          {show ? t.login.hide : t.login.show}
        </button>
      </div>
      <p id={`${base}-rules`} className="muted small">{t.login.rules}</p>
      <label htmlFor={`${base}-confirm`}>{t.login.confirm}</label>
      <input id={`${base}-confirm`} name="confirm" type={show ? "text" : "password"} autoComplete="new-password" required minLength={10} maxLength={128} />
      {state.status === "error" && <p className="notice notice-warn" role="alert">{state.message}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? t.login.saving : t.login.save}
      </button>
    </form>
  );
}
