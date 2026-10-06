"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";

const idle: LoginState = { status: "idle", message: "" };

/**
 * Connexion (V4, § 5) : e-mail, mot de passe, Se connecter, Créer un compte, Recevoir un lien.
 * Une erreur de champ s'affiche sous ce champ (aria-invalid, aria-describedby) et y place le
 * focus ; l'adresse saisie est conservée après une erreur.
 */
export function LoginForm({ signupHref }: { signupHref: string }) {
  const t = useT();
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, idle);
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLink, idle);
  const [show, setShow] = useState(false);
  // Le message affiché est celui du dernier bouton utilisé.
  const [last, setLast] = useState<"password" | "link">("password");
  const base = useId();
  const state = last === "link" ? linkState : pwState;
  const pending = pwPending || linkPending;
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const emailError = state.status === "error" && state.field === "email";
  const passwordError = state.status === "error" && state.field === "password";
  const general = state.message && !state.field;

  // Après un envoi refusé : focus sur le premier champ en cause.
  useEffect(() => {
    if (state.field === "email") emailRef.current?.focus();
    else if (state.field === "password") passwordRef.current?.focus();
  }, [state]);

  return (
    <form action={pwAction} className="auth-form" noValidate>
      <div className="auth-field">
        <label className="field-label" htmlFor={`${base}-email`}>{t.login.v2Email}</label>
        <input
          ref={emailRef}
          id={`${base}-email`}
          className="auth-input"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          placeholder={t.login.emailPlaceholder}
          defaultValue={state.email}
          aria-invalid={emailError || undefined}
          aria-describedby={emailError ? `${base}-email-err` : undefined}
          required
        />
        {emailError && <p id={`${base}-email-err`} className="field-error">{state.message}</p>}
      </div>

      <div className="auth-field">
        <label className="field-label" htmlFor={`${base}-password`}>{t.login.password}</label>
        <div className="auth-password">
          <input
            ref={passwordRef}
            id={`${base}-password`}
            className="auth-input"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            placeholder={t.login.passwordPlaceholder}
            aria-invalid={passwordError || undefined}
            aria-describedby={passwordError ? `${base}-password-err` : undefined}
          />
          <button
            type="button"
            className="icon-button auth-eye"
            aria-pressed={show}
            aria-controls={`${base}-password`}
            aria-label={show ? t.login.hide : t.login.show}
            onClick={() => setShow((s) => !s)}
          >
            <Icon name={show ? "eye-off" : "eye"} size={20} />
          </button>
        </div>
        {passwordError && <p id={`${base}-password-err`} className="field-error">{state.message}</p>}
        <p className="auth-forgot">
          <Link href="/connexion/mot-de-passe-oublie">{t.login.forgot}</Link>
        </p>
      </div>

      <p role="status" className={general ? (state.status === "error" ? "notice notice-warn" : "notice") : "sr-only"}>
        {general ? state.message : ""}
      </p>

      <button type="submit" className="btn btn-primary btn-block" disabled={pending} onClick={() => setLast("password")}>
        {pwPending ? t.login.signingIn : t.login.signIn} <Icon name="arrow" size={20} />
      </button>
      <Link href={signupHref} className="btn btn-block auth-secondary">{t.v4.login.createAccount}</Link>
      <button type="submit" formAction={linkAction} formNoValidate className="btn-link auth-magic" disabled={pending} onClick={() => setLast("link")}>
        <Icon name="mail" size={20} /> {linkPending ? t.login.sending : t.login.magicLink}
      </button>
    </form>
  );
}
