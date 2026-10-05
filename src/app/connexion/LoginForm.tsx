"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
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
    <form action={pwAction} className="card login" aria-describedby={`${base}-status`}>
      <label htmlFor={`${base}-email`}>{t.login.email}</label>
      <input id={`${base}-email`} name="email" type="email" autoComplete="username" inputMode="email" required />

      <label htmlFor={`${base}-password`}>{t.login.password}</label>
      <div className="password-field">
        <input id={`${base}-password`} name="password" type={show ? "text" : "password"} autoComplete="current-password" />
        <button
          type="button"
          className="password-toggle"
          aria-pressed={show}
          aria-controls={`${base}-password`}
          onClick={() => setShow((s) => !s)}
        >
          {show ? t.login.hide : t.login.show}
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
      <p className="login-or" aria-hidden="true"><span>{t.login.or}</span></p>
      <button type="submit" formAction={linkAction} formNoValidate className="btn btn-block" disabled={pending} onClick={() => setLast("link")}>
        {linkPending ? t.login.sending : t.login.magicLink}
      </button>
    </form>
  );
}
