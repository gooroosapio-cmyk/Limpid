"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { signUp, type LoginState } from "@/app/connexion/actions";

/** Inscription gratuite : adresse et mot de passe, puis confirmation par email. */
export function SignupForm() {
  const t = useT();
  const s = t.signup;
  const id = useId();
  const [state, action, pending] = useActionState<LoginState, FormData>(signUp, { status: "idle", message: "" });
  const [show, setShow] = useState(false);
  if (state.status === "sent") {
    return (
      <div className="card" role="status">
        <h2>{s.sentTitle}</h2>
        <p>{state.message}</p>
        <Link href="/connexion" className="btn btn-block">{s.already}</Link>
      </div>
    );
  }
  return (
    <form action={action} className="card">
      <label htmlFor={`${id}-email`}>{s.email}</label>
      <input id={`${id}-email`} name="email" type="email" autoComplete="email" required maxLength={254} />
      <label htmlFor={`${id}-pw`}>{s.password}</label>
      <div className="password-field">
        <input id={`${id}-pw`} name="password" type={show ? "text" : "password"} autoComplete="new-password" required minLength={10} maxLength={128} aria-describedby={`${id}-rules`} />
        <button type="button" className="password-toggle" aria-pressed={show} aria-controls={`${id}-pw`} onClick={() => setShow((v) => !v)}>
          {show ? t.login.hide : t.login.show}
        </button>
      </div>
      <p id={`${id}-rules`} className="muted small">{t.login.rules}</p>
      {state.status === "error" && <p className="notice notice-warn" role="alert">{state.message}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>{pending ? s.creating : s.submit}</button>
      <p className="muted small">{s.noCard}</p>
      <p className="center"><Link href="/connexion" className="btn-link">{s.already}</Link></p>
    </form>
  );
}
