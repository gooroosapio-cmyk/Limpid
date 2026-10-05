"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";

const idle: LoginState = { status: "idle", message: "" };

/** Connexion (maquette « Connexion ») : mot de passe, ou lien reçu par email. */
export function LoginForm() {
  const t = useT();
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, idle);
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLink, idle);
  const [show, setShow] = useState(false);
  // Le message affiché est celui du dernier bouton utilisé.
  const [last, setLast] = useState<"password" | "link">("password");
  const base = useId();
  const state = last === "link" ? linkState : pwState;
  const pending = pwPending || linkPending;

  return (
    <form action={pwAction} className="login" aria-describedby={`${base}-status`}>
      <label htmlFor={`${base}-email`}>{t.login.email}</label>
      <div className="field">
        <Icon name="mail" />
        <input id={`${base}-email`} name="email" type="email" autoComplete="username" inputMode="email" placeholder={t.login.emailPlaceholder} required />
      </div>

      <label htmlFor={`${base}-password`}>{t.login.password}</label>
      <div className="field password-field">
        <Icon name="lock" />
        <input id={`${base}-password`} name="password" type={show ? "text" : "password"} autoComplete="current-password" placeholder={t.login.passwordPlaceholder} />
        <button
          type="button"
          className="ib password-toggle"
          aria-pressed={show}
          aria-controls={`${base}-password`}
          aria-label={show ? t.login.hide : t.login.show}
          onClick={() => setShow((s) => !s)}
        >
          <Icon name={show ? "eye-off" : "eye"} />
        </button>
      </div>
      <p className="login-forgot">
        <Link href="/connexion/mot-de-passe-oublie">{t.login.forgot}</Link>
      </p>

      <p id={`${base}-status`} role="status" className={state.status === "error" ? "notice notice-warn" : state.message ? "notice" : "sr-only"}>
        {state.message}
      </p>

      <button type="submit" className="btn btn-primary btn-block" disabled={pending} onClick={() => setLast("password")}>
        {pwPending ? t.login.signingIn : t.login.signIn}
      </button>
      <button type="submit" formAction={linkAction} formNoValidate className="btn-link login-magic" disabled={pending} onClick={() => setLast("link")}>
        {linkPending ? t.login.sending : t.login.magicLink}
      </button>
    </form>
  );
}
