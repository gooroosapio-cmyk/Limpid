"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import { signUp, type LoginState } from "@/app/connexion/actions";

/**
 * Inscription gratuite : adresse et mot de passe, puis confirmation par email. Erreur affichée
 * sous le champ en cause, focus sur ce champ, adresse conservée.
 */
export function SignupForm() {
  const t = useT();
  const s = t.signup;
  const id = useId();
  const [state, action, pending] = useActionState<LoginState, FormData>(signUp, { status: "idle", message: "" });
  const [show, setShow] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const emailError = state.status === "error" && state.field === "email";
  const pwError = state.status === "error" && state.field === "password";

  useEffect(() => {
    if (state.field === "email") emailRef.current?.focus();
    else if (state.field === "password") pwRef.current?.focus();
  }, [state]);

  if (state.status === "sent") {
    return (
      <div className="card auth-sent" role="status">
        <h2>{s.sentTitle}</h2>
        <p>{state.message}</p>
        <Link href="/connexion" className="btn btn-block">{s.already}</Link>
      </div>
    );
  }
  return (
    <form action={action} className="auth-form" noValidate>
      <div className="auth-field">
        <label className="field-label" htmlFor={`${id}-email`}>{s.email}</label>
        <input
          ref={emailRef}
          id={`${id}-email`}
          className="auth-input"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          defaultValue={state.email}
          aria-invalid={emailError || undefined}
          aria-describedby={emailError ? `${id}-email-err` : undefined}
        />
        {emailError && <p id={`${id}-email-err`} className="field-error">{state.message}</p>}
      </div>
      <div className="auth-field">
        <label className="field-label" htmlFor={`${id}-pw`}>{s.password}</label>
        <div className="auth-password">
          <input
            ref={pwRef}
            id={`${id}-pw`}
            className="auth-input"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
            aria-invalid={pwError || undefined}
            aria-describedby={`${id}-rules${pwError ? ` ${id}-pw-err` : ""}`}
          />
          <button type="button" className="icon-button auth-eye" aria-pressed={show} aria-controls={`${id}-pw`} aria-label={show ? t.login.hide : t.login.show} onClick={() => setShow((v) => !v)}>
            <Icon name={show ? "eye-off" : "eye"} size={20} />
          </button>
        </div>
        {pwError && <p id={`${id}-pw-err`} className="field-error">{state.message}</p>}
        <p id={`${id}-rules`} className="meta">{t.login.rules}</p>
      </div>
      {state.status === "error" && !state.field && <p className="notice notice-warn" role="alert">{state.message}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>{pending ? s.creating : s.submit}</button>
      <p className="meta">{s.noCard}</p>
      <Link href="/connexion" className="btn btn-block auth-secondary">{s.already}</Link>
    </form>
  );
}
